// ============================================================
// Bord Parser
// ============================================================

import { Lexer, Token, TokenType } from "../lexer";
import {
  BordFile,
  ComponentNode,
  PropsBlock,
  StateBlock,
  ServerBlock,
  ClientBlock,
  ViewBlock,
  FieldDecl,
  ServerAssignment,
  ClientFunction,
  Param,
  TypeAliasNode,
  TypeExpr,
  ObjectField,
  Expr,
  Span,
  Position,
} from "./ast";

export class ParseError extends Error {
  constructor(
    message: string,
    public span: Span,
  ) {
    super(`[Parse] ${message} at line ${span.start.line}:${span.start.column}`);
  }
}

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private lexer: Lexer;

  constructor(private src: string) {
    this.lexer = new Lexer(src);
    this.tokens = this.lexer.tokenize();
  }

  // ---- Public ----

  parse(): BordFile {
    const start = this.peek().position;
    const typeAliases: TypeAliasNode[] = [];

    while (!this.isEOF()) {
      if (this.check("TYPE")) {
        typeAliases.push(this.parseTypeAlias());
        continue;
      }
      if (this.check("COMPONENT")) break;
      throw this.error(
        `Expected 'component' or 'type', got '${this.peek().value}'`,
      );
    }

    const component = this.parseComponent();

    while (!this.isEOF()) {
      if (this.check("TYPE")) {
        typeAliases.push(this.parseTypeAlias());
        continue;
      }
      throw this.error(
        `Unexpected token '${this.peek().value}' after component`,
      );
    }

    return {
      kind: "BordFile",
      component,
      typeAliases,
      span: { start, end: this.prev().position },
    };
  }

  // ---- Component ----

  private parseComponent(): ComponentNode {
    const start = this.peek().position;
    this.expect("COMPONENT");
    const name = this.expect("IDENT").value;
    this.expect("LBRACE");

    let props: PropsBlock | undefined;
    let state: StateBlock | undefined;
    let server: ServerBlock | undefined;
    let client: ClientBlock | undefined;
    let view: ViewBlock | undefined;

    while (!this.check("RBRACE") && !this.isEOF()) {
      switch (this.peek().type) {
        case "PROPS":
          props = this.parsePropsBlock();
          break;
        case "STATE":
          state = this.parseStateBlock();
          break;
        case "SERVER":
          server = this.parseServerBlock();
          break;
        case "CLIENT":
          client = this.parseClientBlock();
          break;
        case "VIEW":
          view = this.parseViewBlock();
          break;
        default:
          throw this.error(
            `Unknown block '${this.peek().value}' inside component`,
          );
      }
    }

    this.expect("RBRACE");
    if (!view)
      throw this.error(`Component '${name}' is missing required 'view' block`);

    return {
      kind: "Component",
      name,
      props,
      state,
      server,
      client,
      view,
      span: { start, end: this.prev().position },
    };
  }

  // ---- Blocks ----

  private parsePropsBlock(): PropsBlock {
    const start = this.peek().position;
    this.expect("PROPS");
    this.expect("LBRACE");
    const fields: FieldDecl[] = [];
    while (!this.check("RBRACE") && !this.isEOF()) {
      fields.push(this.parseFieldDecl(true));
      this.tryConsume("SEMICOLON");
      this.tryConsume("COMMA");
    }
    this.expect("RBRACE");
    return {
      kind: "PropsBlock",
      fields,
      span: { start, end: this.prev().position },
    };
  }

  private parseStateBlock(): StateBlock {
    const start = this.peek().position;
    this.expect("STATE");
    this.expect("LBRACE");
    const fields: FieldDecl[] = [];
    while (!this.check("RBRACE") && !this.isEOF()) {
      fields.push(this.parseFieldDecl(false));
      this.tryConsume("SEMICOLON");
      this.tryConsume("COMMA");
    }
    this.expect("RBRACE");
    return {
      kind: "StateBlock",
      fields,
      span: { start, end: this.prev().position },
    };
  }

  private parseServerBlock(): ServerBlock {
    const start = this.peek().position;
    this.expect("SERVER");
    this.expect("LBRACE");
    const assignments: ServerAssignment[] = [];
    while (!this.check("RBRACE") && !this.isEOF()) {
      assignments.push(this.parseServerAssignment());
      this.tryConsume("SEMICOLON");
    }
    this.expect("RBRACE");
    return {
      kind: "ServerBlock",
      assignments,
      span: { start, end: this.prev().position },
    };
  }

  private parseClientBlock(): ClientBlock {
    const start = this.peek().position;
    this.expect("CLIENT");
    this.expect("LBRACE");
    const functions: ClientFunction[] = [];
    while (!this.check("RBRACE") && !this.isEOF()) {
      functions.push(this.parseClientFunction());
    }
    this.expect("RBRACE");
    return {
      kind: "ClientBlock",
      functions,
      span: { start, end: this.prev().position },
    };
  }

  private parseViewBlock(): ViewBlock {
    const start = this.peek().position;
    this.expect("VIEW");
    // Consume the `{` token, then sync the lexer and capture raw JSX
    const raw = this.expect("RAW_BLOCK");
    return {
      kind: "ViewBlock",
      jsx: raw.value,
      span: { start, end: this.prev().position },
    };
  }

  // ---- Declarations ----

  private parseFieldDecl(typeRequired: boolean): FieldDecl {
    const start = this.peek().position;
    const name = this.expect("IDENT").value;
    let typeAnnotation: TypeExpr | null = null;
    let defaultValue: Expr | null = null;

    if (this.tryConsume("COLON")) {
      typeAnnotation = this.parseTypeExpr();
    } else if (typeRequired) {
      throw this.error(`Props field '${name}' must have a type annotation`);
    }

    if (this.tryConsume("EQ")) {
      defaultValue = this.parseSimpleExpr();
    }

    return {
      kind: "FieldDecl",
      name,
      typeAnnotation,
      defaultValue,
      span: { start, end: this.prev().position },
    };
  }

  private parseServerAssignment(): ServerAssignment {
    const start = this.peek().position;
    const name = this.expect("IDENT").value;
    let typeAnnotation: TypeExpr | null = null;

    if (this.tryConsume("COLON")) {
      typeAnnotation = this.parseTypeExpr();
    }
    this.expect("EQ");

    const isAsync = this.check("AWAIT");
    let value: Expr;

    if (isAsync) {
      this.expect("AWAIT");
      // Capture the rest of the expression until semicolon
      const raw = this.captureUntilSemicolon();
      value = {
        kind: "AwaitExpr",
        expression: raw,
        span: { start, end: this.prev().position },
      };
    } else {
      value = this.parseSimpleExpr();
    }

    this.tryConsume("SEMICOLON");
    return {
      kind: "ServerAssignment",
      name,
      typeAnnotation,
      value,
      isAsync,
      span: { start, end: this.prev().position },
    };
  }

  private parseClientFunction(): ClientFunction {
    const start = this.peek().position;
    // async handleXxx = async () => { ... }
    // or: handleXxx = () => { ... }
    // or: handleXxx = async () => { ... }
    let leadAsync = false;
    if (this.check("ASYNC")) {
      this.advance();
      leadAsync = true;
    }

    const name = this.expect("IDENT").value;
    this.expect("EQ");

    let isAsync = leadAsync;
    if (this.check("ASYNC")) {
      this.advance();
      isAsync = true;
    }

    this.expect("LPAREN");
    const params = this.parseParams();
    this.expect("RPAREN");
    this.expect("ARROW");
    this.expect("LBRACE");
    const body = this.captureRaw();

    return {
      kind: "ClientFunction",
      name,
      params,
      isAsync,
      body,
      span: { start, end: this.prev().position },
    };
  }

  private parseParams(): Param[] {
    const params: Param[] = [];
    while (!this.check("RPAREN") && !this.isEOF()) {
      const start = this.peek().position;
      const name = this.expect("IDENT").value;
      let typeAnnotation: TypeExpr | null = null;
      if (this.tryConsume("COLON")) typeAnnotation = this.parseTypeExpr();
      params.push({
        kind: "Param",
        name,
        typeAnnotation,
        span: { start, end: this.prev().position },
      });
      this.tryConsume("COMMA");
    }
    return params;
  }

  // ---- Type Alias ----

  private parseTypeAlias(): TypeAliasNode {
    const start = this.peek().position;
    this.expect("TYPE");
    const name = this.expect("IDENT").value;
    this.expect("EQ");
    const definition = this.parseTypeExpr();
    this.tryConsume("SEMICOLON");
    return {
      kind: "TypeAlias",
      name,
      definition,
      span: { start, end: this.prev().position },
    };
  }

  // ---- Type Expressions ----

  private parseTypeExpr(): TypeExpr {
    const start = this.peek().position;
    let base: TypeExpr;

    if (this.check("LBRACE")) {
      base = this.parseObjectType();
    } else {
      const name = this.expect("IDENT").value;
      const primitives = ["string", "number", "boolean", "null", "undefined"];
      if (primitives.includes(name)) {
        base = {
          kind: "PrimitiveType",
          name: name as "string" | "number" | "boolean" | "null" | "undefined",
          span: { start, end: this.prev().position },
        };
      } else {
        base = {
          kind: "ReferenceType",
          name,
          span: { start, end: this.prev().position },
        };
      }
    }

    // Postfix: string[]
    while (this.check("LBRACKET") && this.peekAt(1).type === "RBRACKET") {
      this.advance();
      this.advance();
      base = {
        kind: "ArrayType",
        elementType: base,
        span: { start, end: this.prev().position },
      };
    }

    // Postfix: string?
    if (this.tryConsume("QUESTION")) {
      base = {
        kind: "OptionalType",
        innerType: base,
        span: { start, end: this.prev().position },
      };
    }

    return base;
  }

  private parseObjectType(): TypeExpr {
    const start = this.peek().position;
    this.expect("LBRACE");
    const fields: ObjectField[] = [];

    while (!this.check("RBRACE") && !this.isEOF()) {
      const fStart = this.peek().position;
      const name = this.expect("IDENT").value;
      const optional = this.tryConsume("QUESTION");
      this.expect("COLON");
      const typeAnnotation = this.parseTypeExpr();
      let defaultValue: Expr | null = null;
      if (this.tryConsume("EQ")) defaultValue = this.parseSimpleExpr();
      this.tryConsume("SEMICOLON");
      this.tryConsume("COMMA");
      fields.push({
        kind: "ObjectField",
        name,
        typeAnnotation,
        defaultValue,
        optional,
        span: { fStart, end: this.prev().position } as unknown as Span,
      });
    }

    this.expect("RBRACE");
    return {
      kind: "ObjectType",
      fields,
      span: { start, end: this.prev().position },
    };
  }

  // ---- Simple expression parser (for default values / server assignments) ----

  private parseSimpleExpr(): Expr {
    const start = this.peek().position;
    const tok = this.peek();
    if (tok.type === "STRING") {
      this.advance();
      return {
        kind: "StringLiteral",
        value: tok.value,
        span: { start, end: this.prev().position },
      };
    }
    if (tok.type === "NUMBER") {
      this.advance();
      return {
        kind: "NumberLiteral",
        value: parseFloat(tok.value),
        span: { start, end: this.prev().position },
      };
    }
    if (tok.type === "TRUE") {
      this.advance();
      return {
        kind: "BooleanLiteral",
        value: true,
        span: { start, end: this.prev().position },
      };
    }
    if (tok.type === "FALSE") {
      this.advance();
      return {
        kind: "BooleanLiteral",
        value: false,
        span: { start, end: this.prev().position },
      };
    }
    if (tok.type === "NULL") {
      this.advance();
      return {
        kind: "NullLiteral",
        span: { start, end: this.prev().position },
      };
    }
    const raw = this.captureUntilSemicolon();
    return {
      kind: "RawExpr",
      value: raw,
      span: { start, end: this.prev().position },
    };
  }

  // ---- Raw capture: syncs lexer pos to token stream, then reads char-by-char ----

  /**
   * Captures raw source content until the matching `}` (depth=0).
   * Must be called immediately after the opening `{` token has been consumed.
   * The lexer's pos is synced to the current token offset before capturing.
   */
  private captureRaw(): string {
    // Sync lexer.pos to where the token stream is now
    const offset = this.peek().position.offset;
    this.lexer.currentPos = offset;

    // Read raw until balanced close
    const raw = this.lexer.readRawBlock();

    // Fast-forward token stream past all tokens inside the captured block
    while (
      !this.isEOF() &&
      this.tokens[this.pos].position.offset <= this.lexer.currentPos
    ) {
      this.pos++;
    }

    return raw;
  }

  private captureUntilSemicolon(): string {
    const parts: string[] = [];
    while (!this.isEOF() && !this.check("SEMICOLON") && !this.check("RBRACE")) {
      parts.push(this.peek().value);
      this.advance();
    }
    this.tryConsume("SEMICOLON");
    return parts.join(" ");
  }

  // ---- Token stream helpers ----

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private peekAt(n: number): Token {
    return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)];
  }
  private prev(): Token {
    return this.tokens[Math.max(this.pos - 1, 0)];
  }
  private isEOF(): boolean {
    return (
      this.pos >= this.tokens.length || this.tokens[this.pos].type === "EOF"
    );
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (!this.isEOF()) this.pos++;
    return t;
  }

  private check(type: TokenType): boolean {
    return this.tokens[this.pos].type === type;
  }

  private expect(type: TokenType): Token {
    if (!this.check(type))
      throw this.error(
        `Expected '${type}', got '${this.peek().type}' ('${this.peek().value}')`,
      );
    return this.advance();
  }

  private tryConsume(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private error(message: string): ParseError {
    const pos = this.peek().position;
    return new ParseError(message, { start: pos, end: pos });
  }
}
