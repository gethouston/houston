import ts from "typescript";
import { namedValue, unwrap } from "./assistant-ast.ts";
import type { PathEncoding } from "./assistant-catalog-types.ts";

export type PathPart =
  | { kind: "text"; text: string }
  | { kind: "param"; name: string; encoding: PathEncoding }
  | { kind: "query"; key: string; name: string };

export type Binding =
  | { kind: "param"; name: string }
  | { kind: "parts"; parts: PathPart[] }
  | { kind: "opaque" };

export interface ValueScope {
  parameters: Set<string>;
  bindings: Map<string, Binding>;
  locals: (name: string) => ts.Expression | null;
}

export const NO_LOCALS = (): null => null;

export function boundParameter(
  expression: ts.Expression,
  scope: ValueScope,
): string | null {
  const name = namedValue(expression);
  if (name === null) return null;
  const binding = scope.bindings.get(name);
  if (binding) return binding.kind === "param" ? binding.name : null;
  return scope.parameters.has(name) ? name : null;
}

export function bindingParts(
  expression: ts.Expression,
  scope: ValueScope,
): PathPart[] | null {
  const inner = unwrap(expression);
  if (!ts.isIdentifier(inner)) return null;
  const binding = scope.bindings.get(inner.text);
  return binding?.kind === "parts" ? binding.parts : null;
}

function rootIdentifier(expression: ts.Expression): string | null {
  let node = unwrap(expression);
  while (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  )
    node = unwrap(node.expression);
  return ts.isIdentifier(node) ? node.text : null;
}

export function callerSupplied(
  expression: ts.Expression,
  scope: ValueScope,
): boolean {
  const root = rootIdentifier(expression);
  if (root === null) return true;
  return scope.bindings.has(root) || scope.parameters.has(root);
}

export function parameterReference(
  expression: ts.Expression,
  scope: ValueScope,
): string | null {
  const keys: string[] = [];
  let node = unwrap(expression);
  while (ts.isPropertyAccessExpression(node)) {
    keys.unshift(node.name.text);
    node = unwrap(node.expression);
  }
  if (!ts.isIdentifier(node)) return null;
  const binding = scope.bindings.get(node.text);
  if (binding)
    return binding.kind === "param" ? [binding.name, ...keys].join(".") : null;
  return scope.parameters.has(node.text)
    ? [node.text, ...keys].join(".")
    : null;
}

export function localInitializers(
  body: ts.Node,
  source: ts.SourceFile,
): (name: string) => ts.Expression | null {
  const locals = new Map<string, ts.Expression>();
  const record = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !locals.has(node.name.text)
    )
      locals.set(node.name.text, node.initializer);
    ts.forEachChild(node, record);
  };
  record(body);
  for (const statement of source.statements)
    if (ts.isVariableStatement(statement)) record(statement);
  return (name) => locals.get(name) ?? null;
}
