// ============================================================
// Bord Lexer
// ============================================================

import { Position } from "../parser/ast";

export const TOKEN_TYPES = [
  "COMPONENT",
  "PROPS",
  "STATE",
  "SERVER",
  "CLIENT",
  "VIEW",
  "TYPE",
  "AWAIT",
  "ASYNC",
  "RETURN",
  "IF",
  "CONST",
  "LET",
  "TRUE",
  "FALSE",
  "NULL",
  "LBRACE",
  "RBRACE",
  "LPAREN",
  "RPAREN",
  "LBRACKET",
  "RBRACKET",
  "COLON",
  "SEMICOLON",
  "COMMA",
  "DOT",
  "EQ",
  "EQEQ",
  "QUESTION",
  "ARROW",
  "AT",
  "STRING",
  "NUMBER",
  "IDENT",
  "PLUS",
  "MINUS",
  "STAR",
  "SLASH",
  "PLUS_EQ",
  "MINUS_EQ",
  "STAR_EQ",
  "SLASH_EQ",
  "EOF",
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export type Token = {
  type: TokenType;
  value: string;
  position: Position;
};

const KEYWORDS: Record<string, TokenType> = {
  component: "COMPONENT",
  props: "PROPS",
  state: "STATE",
  server: "SERVER",
  client: "CLIENT",
  view: "VIEW",
  type: "TYPE",
  await: "AWAIT",
  async: "ASYNC",
  return: "RETURN",
  if: "IF",
  const: "CONST",
  let: "LET",
  true: "TRUE",
  false: "FALSE",
  null: "NULL",
};

export class LexError extends Error {
  constructor(
    message: string,
    public position: Position,
  ) {
    super(`[Lex] ${message} at line ${position.line}:${position.column}`);
  }
}

export class Lexer {
  private pos = 0;
  private line = 1;
  private column = 1;

  constructor(public readonly src: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.src.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.src.length) break;
      tokens.push(this.readToken());
    }
    tokens.push(this.makeToken("EOF", "", this.currentPosition()));
    return tokens;
  }

  private readToken(): Token {
    const ch = this.src[this.pos];
    if (ch === '"' || ch === "'") return this.readString(ch);
    if (
      this.isDigit(ch) ||
      (ch === "-" && this.isDigit(this.src[this.pos + 1] ?? ""))
    ) {
      return this.readNumber();
    }
    if (this.isAlpha(ch) || ch === "_") return this.readIdentOrKeyword();

    const startPos = this.currentPosition();
    switch (ch) {
      case "{":
        this.advance();
        return this.makeToken("LBRACE", "{", startPos);
      case "}":
        this.advance();
        return this.makeToken("RBRACE", "}", startPos);
      case "(":
        this.advance();
        return this.makeToken("LPAREN", "(", startPos);
      case ")":
        this.advance();
        return this.makeToken("RPAREN", ")", startPos);
      case "[":
        this.advance();
        return this.makeToken("LBRACKET", "[", startPos);
      case "]":
        this.advance();
        return this.makeToken("RBRACKET", "]", startPos);
      case ":":
        this.advance();
        return this.makeToken("COLON", ":", startPos);
      case ";":
        this.advance();
        return this.makeToken("SEMICOLON", ";", startPos);
      case ",":
        this.advance();
        return this.makeToken("COMMA", ",", startPos);
      case ".":
        this.advance();
        return this.makeToken("DOT", ".", startPos);
      case "@":
        this.advance();
        return this.makeToken("AT", "@", startPos);
      case "?":
        this.advance();
        return this.makeToken("QUESTION", "?", startPos);

      case "+":
        this.advance();
        if (this.src[this.pos] === "=") {
          this.advance();
          return this.makeToken("PLUS_EQ", "+=", startPos);
        }
        return this.makeToken("PLUS", "+", startPos);
      case "-":
        this.advance();
        if (this.src[this.pos] === "=") {
          this.advance();
          return this.makeToken("MINUS_EQ", "-=", startPos);
        }
        return this.makeToken("MINUS", "-", startPos);
      case "*":
        this.advance();
        if (this.src[this.pos] === "=") {
          this.advance();
          return this.makeToken("STAR_EQ", "*=", startPos);
        }
        return this.makeToken("STAR", "*", startPos);
      case "/":
        this.advance();
        if (this.src[this.pos] === "=") {
          this.advance();
          return this.makeToken("SLASH_EQ", "/=", startPos);
        }
        return this.makeToken("SLASH", "/", startPos);

      case "=":
        this.advance();
        if (this.src[this.pos] === ">") {
          this.advance();
          return this.makeToken("ARROW", "=>", startPos);
        }
        if (this.src[this.pos] === "=") {
          this.advance();
          return this.makeToken("EQEQ", "==", startPos);
        }
        return this.makeToken("EQ", "=", startPos);
      default:
        throw new LexError(`Unexpected character '${ch}'`, startPos);
    }
  }

  private readIdentOrKeyword(): Token {
    const startPos = this.currentPosition();
    let value = "";
    while (
      this.pos < this.src.length &&
      (this.isAlphaNum(this.src[this.pos]) || this.src[this.pos] === "_")
    ) {
      value += this.src[this.pos];
      this.advance();
    }
    return this.makeToken(KEYWORDS[value] ?? "IDENT", value, startPos);
  }

  private readString(quote: string): Token {
    const startPos = this.currentPosition();
    this.advance();
    let value = "";
    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === "\\" && this.pos + 1 < this.src.length) {
        this.advance();
        value += this.src[this.pos];
      } else {
        value += this.src[this.pos];
      }
      this.advance();
    }
    if (this.pos >= this.src.length)
      throw new LexError("Unterminated string literal", startPos);
    this.advance();
    return this.makeToken("STRING", value, startPos);
  }

  private readNumber(): Token {
    const startPos = this.currentPosition();
    let value = "";
    if (this.src[this.pos] === "-") {
      value += "-";
      this.advance();
    }
    while (
      this.pos < this.src.length &&
      (this.isDigit(this.src[this.pos]) || this.src[this.pos] === ".")
    ) {
      value += this.src[this.pos];
      this.advance();
    }
    return this.makeToken("NUMBER", value, startPos);
  }

  /**
   * Reads a balanced brace block, returning the inner content verbatim.
   * Call this AFTER the opening `{` has been consumed from the token stream.
   * Advances this.pos past the closing `}`.
   */
  readRawBlock(): string {
    let depth = 1;
    let raw = "";
    while (this.pos < this.src.length && depth > 0) {
      const ch = this.src[this.pos];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          this.advance();
          break;
        }
      }
      // Skip over string literals to avoid counting braces inside them
      if ((ch === '"' || ch === "'") && depth > 0) {
        const q = ch;
        raw += ch;
        this.advance();
        while (this.pos < this.src.length && this.src[this.pos] !== q) {
          if (this.src[this.pos] === "\\") {
            raw += this.src[this.pos];
            this.advance();
          }
          raw += this.src[this.pos];
          this.advance();
        }
        if (this.pos < this.src.length) {
          raw += this.src[this.pos];
          this.advance();
        }
        continue;
      }
      raw += ch;
      this.advance();
    }
    if (depth !== 0)
      throw new LexError(
        "Unterminated block — missing closing '}'",
        this.currentPosition(),
      );
    return raw.trim();
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
        continue;
      }
      if (ch === "/" && this.src[this.pos + 1] === "/") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n")
          this.advance();
        continue;
      }
      if (ch === "/" && this.src[this.pos + 1] === "*") {
        this.advance();
        this.advance();
        while (this.pos < this.src.length) {
          if (this.src[this.pos] === "*" && this.src[this.pos + 1] === "/") {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
        continue;
      }
      break;
    }
  }

  advance(): void {
    if (this.src[this.pos] === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.pos++;
  }

  get currentPos(): number {
    return this.pos;
  }
  set currentPos(v: number) {
    this.pos = v;
  }

  currentPosition(): Position {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private makeToken(type: TokenType, value: string, position: Position): Token {
    return { type, value, position };
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }
  private isAlpha(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
  }
  private isAlphaNum(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }
}
