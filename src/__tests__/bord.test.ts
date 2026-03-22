// ============================================================
// Bord tests — Lexer / Parser / Checker / Codegen
// ============================================================

import { Lexer }        from "../lexer";
import { Parser }       from "../parser";
import { Checker }      from "../checker";
import { NextjsCodegen } from "../codegen/nextjs";

// ------------------------------------------------------------------ Lexer

describe("Lexer", () => {
  test("tokenizes keywords and idents", () => {
    const tokens = new Lexer("component Foo").tokenize();
    expect(tokens[0].type).toBe("COMPONENT");
    expect(tokens[1].type).toBe("IDENT");
    expect(tokens[1].value).toBe("Foo");
  });

  test("tokenizes string literals", () => {
    const tokens = new Lexer('"hello"').tokenize();
    expect(tokens[0].type).toBe("STRING");
    expect(tokens[0].value).toBe("hello");
  });

  test("tokenizes numbers", () => {
    const tokens = new Lexer("42 3.14").tokenize();
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe("42");
    expect(tokens[1].value).toBe("3.14");
  });

  test("skips line comments", () => {
    const tokens = new Lexer("// this is a comment\nfoo").tokenize();
    expect(tokens[0].type).toBe("IDENT");
    expect(tokens[0].value).toBe("foo");
  });

  test("tokenizes => arrow", () => {
    const tokens = new Lexer("=>").tokenize();
    expect(tokens[0].type).toBe("ARROW");
  });
});

// ------------------------------------------------------------------ Parser

const minimalComponent = `
component Counter {
  state {
    count: number = 0
  }
  view {
    <div>{state.count}</div>
  }
}
`;

const fullComponent = `
type Todo = {
  id: string
  task: string
  checked: boolean = false
}

component TodoApp {
  props {
    maxItems: number
    title: string
  }
  state {
    inputText: string = ""
    filter: string = "all"
  }
  server {
    todos: Todo[] = await db.getTodos()
  }
  client {
    handleAdd = () => {
      state.inputText = ""
    }
    handleToggle = async (id: string) => {
      state.filter = id
    }
  }
  view {
    <div className="app">
      <h1>{props.title}</h1>
      <button onClick={client.handleAdd}>Add</button>
    </div>
  }
}
`;

describe("Parser", () => {
  test("parses minimal component (state + view only)", () => {
    const ast = new Parser(minimalComponent).parse();
    expect(ast.kind).toBe("BordFile");
    expect(ast.component.name).toBe("Counter");
    expect(ast.component.state).toBeDefined();
    expect(ast.component.view).toBeDefined();
    expect(ast.component.props).toBeUndefined();
    expect(ast.component.server).toBeUndefined();
    expect(ast.component.client).toBeUndefined();
  });

  test("state field has default value", () => {
    const ast = new Parser(minimalComponent).parse();
    const countField = ast.component.state!.fields[0];
    expect(countField.name).toBe("count");
    expect(countField.typeAnnotation?.kind).toBe("PrimitiveType");
    expect(countField.defaultValue?.kind).toBe("NumberLiteral");
    expect((countField.defaultValue as { value: number }).value).toBe(0);
  });

  test("parses full component with all blocks", () => {
    const ast = new Parser(fullComponent).parse();
    expect(ast.component.props?.fields).toHaveLength(2);
    expect(ast.component.state?.fields).toHaveLength(2);
    expect(ast.component.server?.assignments).toHaveLength(1);
    expect(ast.component.client?.functions).toHaveLength(2);
  });

  test("parses type alias", () => {
    const ast = new Parser(fullComponent).parse();
    expect(ast.typeAliases).toHaveLength(1);
    expect(ast.typeAliases[0].name).toBe("Todo");
  });

  test("parses server assignment with await", () => {
    const ast = new Parser(fullComponent).parse();
    const srv = ast.component.server!.assignments[0];
    expect(srv.name).toBe("todos");
    expect(srv.isAsync).toBe(true);
    expect(srv.value.kind).toBe("AwaitExpr");
  });

  test("parses async client function", () => {
    const ast = new Parser(fullComponent).parse();
    const toggle = ast.component.client!.functions.find(f => f.name === "handleToggle")!;
    expect(toggle.isAsync).toBe(true);
    expect(toggle.params[0].name).toBe("id");
  });

  test("captures view JSX verbatim", () => {
    const ast = new Parser(fullComponent).parse();
    expect(ast.component.view.jsx).toContain("<div");
    expect(ast.component.view.jsx).toContain("handleAdd");
  });

  test("throws when view block is missing", () => {
    const src = `component Broken { state { x: number = 0 } }`;
    expect(() => new Parser(src).parse()).toThrow(/missing required 'view'/);
  });
});

// ------------------------------------------------------------------ Checker

describe("Checker", () => {
  test("passes valid component", () => {
    const ast    = new Parser(minimalComponent).parse();
    const result = new Checker().check(ast);
    expect(result.errors).toHaveLength(0);
  });

  test("B001: props field without type annotation", () => {
    const src = `
component Bad {
  props { name }
  view { <div /> }
}`;
    const ast    = new Parser(src).parse();
    const result = new Checker().check(ast);
    expect(result.errors.some(e => e.code === "B001")).toBe(true);
  });

  test("B002: state field without default value", () => {
    const src = `
component Bad {
  state { count: number }
  view { <div /> }
}`;
    const ast    = new Parser(src).parse();
    const result = new Checker().check(ast);
    expect(result.errors.some(e => e.code === "B002")).toBe(true);
  });

  test("B003: view event directly mutates state", () => {
    const src = `
component Bad {
  state { count: number = 0 }
  view { <button onClick={state.count++}>click</button> }
}`;
    const ast    = new Parser(src).parse();
    const result = new Checker().check(ast);
    expect(result.errors.some(e => e.code === "B003")).toBe(true);
  });

  test("B004: client accesses server value directly", () => {
    const src = `
component Bad {
  server { secret: string = "key" }
  client {
    doThing = () => {
      const x = server.secret
    }
  }
  view { <div /> }
}`;
    const ast    = new Parser(src).parse();
    const result = new Checker().check(ast);
    expect(result.errors.some(e => e.code === "B004")).toBe(true);
  });

  test("B005: reference to undeclared type", () => {
    const src = `
component Bad {
  props { item: UndeclaredType }
  view { <div /> }
}`;
    const ast    = new Parser(src).parse();
    const result = new Checker().check(ast);
    expect(result.errors.some(e => e.code === "B005")).toBe(true);
  });

  test("passes when type is declared in same file", () => {
    const src = `
type Item = { id: string }
component Good {
  props { item: Item }
  view { <div>{props.item.id}</div> }
}`;
    const ast    = new Parser(src).parse();
    const result = new Checker().check(ast);
    expect(result.errors.filter(e => e.code === "B005")).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ Codegen

describe("NextjsCodegen", () => {
  test("generates three files", () => {
    const ast   = new Parser(fullComponent).parse();
    const files = new NextjsCodegen().generate(ast);
    expect(files["page.tsx"]).toBeDefined();
    expect(files["client.tsx"]).toBeDefined();
    expect(files["types.ts"]).toBeDefined();
  });

  test("page.tsx is async and imports client component", () => {
    const ast   = new Parser(fullComponent).parse();
    const page  = new NextjsCodegen().generate(ast)["page.tsx"];
    expect(page).toContain("async function Page");
    expect(page).toContain("TodoAppClient");
    expect(page).toContain("await");
  });

  test("client.tsx has use client directive", () => {
    const ast    = new Parser(fullComponent).parse();
    const client = new NextjsCodegen().generate(ast)["client.tsx"];
    expect(client.startsWith('"use client"')).toBe(true);
  });

  test("client.tsx rewrites state.xxx = val to setter", () => {
    const ast    = new Parser(fullComponent).parse();
    const client = new NextjsCodegen().generate(ast)["client.tsx"];
    expect(client).toContain("setInputText");
    expect(client).not.toContain("state.inputText");
  });

  test("types.ts exports Props interface and type aliases", () => {
    const ast   = new Parser(fullComponent).parse();
    const types = new NextjsCodegen().generate(ast)["types.ts"];
    expect(types).toContain("export type Todo");
    expect(types).toContain("export interface TodoAppProps");
  });

  test("view JSX strips block prefixes", () => {
    const ast    = new Parser(fullComponent).parse();
    const client = new NextjsCodegen().generate(ast)["client.tsx"];
    expect(client).not.toContain("client.handleAdd");
    expect(client).toContain("handleAdd");
    expect(client).not.toContain("props.title");
    expect(client).toContain("title");
  });
});
