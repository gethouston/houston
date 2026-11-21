import ts from "typescript";
import { unwrap } from "./assistant-ast.ts";

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

export type Local =
  | { kind: "value"; value: ts.Node; docs?: ts.Node }
  | { kind: "member"; from: ts.Expression; name: string };

function bindingKey(element: ts.BindingElement): string {
  const key = element.propertyName ?? element.name;
  return ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : "";
}

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
