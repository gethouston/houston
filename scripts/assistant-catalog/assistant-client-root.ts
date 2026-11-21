import ts from "typescript";
import { calleeName, namedValue, unwrap } from "./assistant-ast.ts";
import type { HopContext, Unresolved } from "./assistant-client-hop.ts";
import type { PathPart } from "./assistant-value-scope.ts";

const AGENT_ROOT = "/agents/";

const CLIENT_FOR = "clientFor";

function declarationOf(
  name: string,
  from: ts.Node,
): ts.VariableDeclaration | ts.ParameterDeclaration | null {
  for (let node: ts.Node | undefined = from; node; node = node.parent) {
    if (ts.isFunctionLike(node))
      for (const parameter of node.parameters)
        if (ts.isIdentifier(parameter.name) && parameter.name.text === name)
          return parameter;
    const statements = ts.isBlock(node)
      ? node.statements
      : ts.isSourceFile(node)
        ? node.statements
        : undefined;
    for (const statement of statements ?? []) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name)
          return declaration;
    }
  }
  return null;
}

function isBaseRooted(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (!ts.isNewExpression(node)) return false;
  const [config] = node.arguments ?? [];
  if (!config || !ts.isObjectLiteralExpression(unwrap(config))) return false;
  return (unwrap(config) as ts.ObjectLiteralExpression).properties.some(
    (property) =>
      (ts.isShorthandPropertyAssignment(property) ||
        ts.isPropertyAssignment(property)) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "baseUrl",
  );
}

export function clientRoot(
  receiver: ts.Expression,
  context: HopContext,
  depth = 0,
): PathPart[] | Unresolved | null {
  const node = unwrap(receiver);
  if (depth > 2) return { unresolved: "the client is resolved too indirectly" };
  if (ts.isCallExpression(node)) {
    if (calleeName(node) !== CLIENT_FOR)
      return {
        unresolved: `the client comes from ${calleeName(node) ?? "a call"}(), which is not ${CLIENT_FOR}()`,
      };
    const agent = node.arguments[0];
    const name = agent ? namedValue(agent) : null;
    if (name === null || !context.parameters.has(name))
      return {
        unresolved: "the agent the client is rooted at is not a parameter",
      };
    return [
      { kind: "text", text: AGENT_ROOT },
      { kind: "param", name, encoding: "segment" },
    ];
  }
  if (!ts.isIdentifier(node)) return null;
  const declaration = declarationOf(node.text, receiver);
  if (!declaration)
    return {
      unresolved: `\`${node.text}\` is declared outside the module, so where it is rooted is not readable here`,
    };
  if (ts.isParameter(declaration)) {
    const supplied = context.substitutions.get(node.text);
    return supplied ? clientRoot(supplied, context, depth + 1) : null;
  }
  if (!declaration.initializer)
    return {
      unresolved: `\`${node.text}\` is declared without an initializer`,
    };
  if (isBaseRooted(declaration.initializer)) return [];
  return clientRoot(declaration.initializer, context, depth + 1);
}
