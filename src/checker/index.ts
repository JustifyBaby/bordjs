// ============================================================
// Bord Checker — type checking + boundary rule enforcement
// ============================================================

import {
  BordFile, ComponentNode,
  ClientBlock, ServerBlock, ViewBlock,
  FieldDecl, TypeExpr,
} from "../parser/ast";

export type CheckError = {
  code: string;
  message: string;
  line: number;
  column: number;
};

export type CheckResult = {
  errors: CheckError[];
  warnings: CheckError[];
};

export class Checker {
  private errors: CheckError[] = [];
  private warnings: CheckError[] = [];
  private typeAliases = new Map<string, TypeExpr>();

  check(file: BordFile): CheckResult {
    this.errors = [];
    this.warnings = [];
    this.typeAliases.clear();

    for (const alias of file.typeAliases) {
      this.typeAliases.set(alias.name, alias.definition);
    }
    this.checkComponent(file.component);
    return { errors: this.errors, warnings: this.warnings };
  }

  private checkComponent(comp: ComponentNode): void {
    // B001: props fields must have type annotations
    if (comp.props) {
      for (const f of comp.props.fields) {
        if (!f.typeAnnotation) {
          this.err("B001", `Props field '${f.name}' must have a type annotation`,
                   f.span.start.line, f.span.start.column);
        }
      }
    }

    // B002: state fields must have default values
    if (comp.state) {
      for (const f of comp.state.fields) {
        if (f.defaultValue === null) {
          this.err("B002", `State field '${f.name}' must have a default value`,
                   f.span.start.line, f.span.start.column);
        }
      }
    }

    // B003 / W001: view event handlers must come from client
    if (comp.view) {
      this.checkViewBoundary(comp.view, comp.client);
    }

    // B004: client must not directly access server values
    if (comp.client && comp.server) {
      const serverNames = new Set(comp.server.assignments.map(a => a.name));
      for (const fn of comp.client.functions) {
        this.checkClientBody(fn.name, fn.body, serverNames, fn.span.start.line);
      }
    }

    // B005: referenced types must be declared
    this.checkTypeReferences(comp);
  }

  private checkViewBoundary(view: ViewBlock, client: ClientBlock | undefined): void {
    const clientFnNames = new Set(client?.functions.map(f => f.name) ?? []);
    const eventPattern = /on[A-Z]\w+\s*=\s*\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = eventPattern.exec(view.jsx)) !== null) {
      const handler = match[1].trim();
      if (handler.includes("client.")) continue;

      const line = view.span.start.line + countNewlines(view.jsx.slice(0, match.index));

      if (handler.includes("state.") || handler.includes("server.")) {
        this.err("B003",
          `View event handler directly mutates state or accesses server — must go through a client function: '${handler.slice(0, 60)}'`,
          line, view.span.start.column);
      } else if (handler.startsWith("(") || handler.startsWith("async")) {
        this.warn("W001",
          `Inline arrow function in view event — prefer a named function in the client block: '${handler.slice(0, 60)}'`,
          line, view.span.start.column);
      }
    }
  }

  private checkClientBody(
    fnName: string, body: string, serverNames: Set<string>, startLine: number
  ): void {
    for (const name of serverNames) {
      if (new RegExp(`\\bserver\\.${name}\\b`).test(body)) {
        this.err("B004",
          `Client function '${fnName}' directly accesses server value '${name}' — server values are not accessible from client code`,
          startLine, 1);
      }
    }
  }

  private checkTypeReferences(comp: ComponentNode): void {
    const check = (type: TypeExpr | null, ctx: string) => {
      if (!type) return;
      this.checkTypeExprRefs(type, ctx);
    };

    comp.props?.fields.forEach(f => check(f.typeAnnotation, `props.${f.name}`));
    comp.state?.fields.forEach(f => check(f.typeAnnotation, `state.${f.name}`));
    comp.server?.assignments.forEach(a => check(a.typeAnnotation, `server.${a.name}`));
    comp.client?.functions.forEach(fn =>
      fn.params.forEach(p => check(p.typeAnnotation, `client.${fn.name}:${p.name}`))
    );
  }

  private checkTypeExprRefs(type: TypeExpr, ctx: string): void {
    switch (type.kind) {
      case "ReferenceType":
        if (!this.typeAliases.has(type.name)) {
          this.err("B005",
            `Unknown type '${type.name}' in '${ctx}' — declare it with: type ${type.name} = { ... }`,
            type.span.start.line, type.span.start.column);
        }
        break;
      case "ArrayType":    this.checkTypeExprRefs(type.elementType, ctx); break;
      case "OptionalType": this.checkTypeExprRefs(type.innerType, ctx); break;
      case "ObjectType":
        type.fields.forEach(f => this.checkTypeExprRefs(f.typeAnnotation, `${ctx}.${f.name}`));
        break;
    }
  }

  private err(code: string, message: string, line: number, column: number): void {
    this.errors.push({ code, message, line, column });
  }
  private warn(code: string, message: string, line: number, column: number): void {
    this.warnings.push({ code, message, line, column });
  }
}

function countNewlines(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}
