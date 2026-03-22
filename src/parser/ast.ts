// ============================================================
// Bord AST — Abstract Syntax Tree node definitions
// ============================================================

export type Position = {
  line: number;
  column: number;
  offset: number;
};

export type Span = {
  start: Position;
  end: Position;
};

// ---- Top-level ----

export type BordFile = {
  kind: "BordFile";
  component: ComponentNode;
  typeAliases: TypeAliasNode[];
  span: Span;
};

export type ComponentNode = {
  kind: "Component";
  name: string;
  props?: PropsBlock;
  state?: StateBlock;
  server?: ServerBlock;
  client?: ClientBlock;
  view: ViewBlock; // required
  span: Span;
};

// ---- Blocks ----

export type PropsBlock = {
  kind: "PropsBlock";
  fields: FieldDecl[];
  span: Span;
};

export type StateBlock = {
  kind: "StateBlock";
  fields: FieldDecl[];
  span: Span;
};

export type ServerBlock = {
  kind: "ServerBlock";
  assignments: ServerAssignment[];
  span: Span;
};

export type ClientBlock = {
  kind: "ClientBlock";
  functions: ClientFunction[];
  span: Span;
};

export type ViewBlock = {
  kind: "ViewBlock";
  jsx: string; // raw JSX captured verbatim
  span: Span;
};

// ---- Declarations ----

export type FieldDecl = {
  kind: "FieldDecl";
  name: string;
  typeAnnotation: TypeExpr | null; // null = inferred (only allowed outside props)
  defaultValue: Expr | null;
  span: Span;
};

export type ServerAssignment = {
  kind: "ServerAssignment";
  name: string;
  typeAnnotation: TypeExpr | null;
  value: Expr;
  isAsync: boolean;
  span: Span;
};

export type ClientFunction = {
  kind: "ClientFunction";
  name: string;
  params: Param[];
  isAsync: boolean;
  body: string; // raw function body captured verbatim
  span: Span;
};

export type Param = {
  kind: "Param";
  name: string;
  typeAnnotation: TypeExpr | null;
  span: Span;
};

// ---- Type Alias ----

export type TypeAliasNode = {
  kind: "TypeAlias";
  name: string;
  definition: TypeExpr;
  span: Span;
};

// ---- Type Expressions ----

export type TypeExpr =
  | PrimitiveType
  | ArrayType
  | OptionalType
  | ObjectType
  | ReferenceType;

export type PrimitiveType = {
  kind: "PrimitiveType";
  name: "string" | "number" | "boolean" | "null" | "undefined";
  span: Span;
};

export type ArrayType = {
  kind: "ArrayType";
  elementType: TypeExpr;
  span: Span;
};

export type OptionalType = {
  kind: "OptionalType";
  innerType: TypeExpr;
  span: Span;
};

export type ObjectType = {
  kind: "ObjectType";
  fields: ObjectField[];
  span: Span;
};

export type ObjectField = {
  kind: "ObjectField";
  name: string;
  typeAnnotation: TypeExpr;
  defaultValue: Expr | null;
  optional: boolean;
  span: Span;
};

export type ReferenceType = {
  kind: "ReferenceType";
  name: string;
  span: Span;
};

// ---- Expressions ----

export type Expr =
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | NullLiteral
  | AwaitExpr
  | RawExpr;

export type StringLiteral  = { kind: "StringLiteral";  value: string;  span: Span };
export type NumberLiteral  = { kind: "NumberLiteral";  value: number;  span: Span };
export type BooleanLiteral = { kind: "BooleanLiteral"; value: boolean; span: Span };
export type NullLiteral    = { kind: "NullLiteral";                    span: Span };
export type AwaitExpr      = { kind: "AwaitExpr"; expression: string;  span: Span };
export type RawExpr        = { kind: "RawExpr";   value: string;       span: Span };
