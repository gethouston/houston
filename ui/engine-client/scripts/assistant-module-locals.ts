import ts from "typescript";
import { unwrap } from "./assistant-ast.ts";

/**
 * Reading a factory closure's own body: what it hands back, what each name in
 * it stands for, and what a call filled its parameters with. The walk over the
 * SDK facade (./assistant-module-surface.ts) is built out of these three.
 */

export type FunctionNode =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;

export function isFunctionNode(node: ts.Node): node is FunctionNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

/** The object literal a function hands back, or null when it returns anything
 *  else. Answering with one is what makes a function a factory candidate. */
export function returnedObject(
  factory: FunctionNode,
): ts.ObjectLiteralExpression | null {
  const body = factory.body;
  if (!body || !ts.isBlock(body)) return null;
  for (const statement of [...body.statements].reverse()) {
    if (!ts.isReturnStatement(statement) || !statement.expression) continue;
    const value = unwrap(statement.expression);
    if (ts.isObjectLiteralExpression(value)) return value;
  }
  return null;
}

/** What an identifier stands for inside a factory body. */
export type Local =
  | { kind: "value"; value: ts.Node; docs?: ts.Node }
  | { kind: "member"; from: ts.Expression; name: string };

/** The member name a destructured element reads, `{ a: b }` included. */
function bindingKey(element: ts.BindingElement): string {
  const key = element.propertyName ?? element.name;
  return ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : "";
}

/**
 * The binding a name has in `scope`'s body: a value, or one member of one. An
 * overloaded function binds to its IMPLEMENTATION — the signatures above it
 * have no body, and a body is what the request lives in.
 */
export function localBinding(name: string, scope: FunctionNode): Local | null {
  const body = scope.body;
  if (!body || !ts.isBlock(body)) return null;
  let overload: Local | null = null;
  for (const statement of body.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      if (statement.body) return { kind: "value", value: statement };
      overload ??= { kind: "value", value: statement };
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name)
        // The STATEMENT carries the JSDoc an author wrote above `const x = …`;
        // the initializer itself starts after the `=`.
        return {
          kind: "value",
          value: declaration.initializer,
          docs: statement,
        };
      if (!ts.isObjectBindingPattern(declaration.name)) continue;
      for (const element of declaration.name.elements)
        if (ts.isIdentifier(element.name) && element.name.text === name)
          return {
            kind: "member",
            from: declaration.initializer,
            name: bindingKey(element),
          };
    }
  }
  return overload;
}

/** What a factory call binds each of the factory's parameters to. */
export function argumentsOf(
  factory: FunctionNode,
  call: ts.CallExpression,
  outer: Map<string, ts.Expression>,
): Map<string, ts.Expression> {
  const subs = new Map(outer);
  for (const [index, parameter] of factory.parameters.entries()) {
    const argument = call.arguments[index];
    if (argument && ts.isIdentifier(parameter.name))
      subs.set(parameter.name.text, argument);
  }
  return subs;
}
