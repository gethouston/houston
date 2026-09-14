import ts from "typescript";
import { calleeName, namedValue, unwrap } from "./assistant-ast.ts";
import type { HopContext, Unresolved } from "./assistant-client-hop.ts";
import type { PathPart } from "./assistant-value-scope.ts";

/**
 * Where a sub-client is rooted, which is the prefix every literal inside it
 * hangs off.
 */

/**
 * The route prefix a per-agent client is rooted at. `ModuleContext.clientFor`
 * builds `${baseUrl}/agents/${encodeURIComponent(agentId)}` (packages/sdk/
 * src/sdk.ts), so every method on it hangs off that prefix; the user-scoped
 * clients take the base URL itself and their literals already carry `/v1`.
 */
const AGENT_ROOT = "/agents/";

/** How a module resolves the client it calls: `ctx.clientFor(<agentId>)`. */
const CLIENT_FOR = "clientFor";

/** The declaration an identifier refers to, searching outward from `from`. */
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

/** `new SomeClient({ baseUrl, … })` — a client rooted at the engine base. */
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

/**
 * The prefix the receiving client contributes, or why it cannot be composed.
 * `null` means the expression is not a client this module resolved at all.
 */
export function clientRoot(
  receiver: ts.Expression,
  context: HopContext,
  depth = 0,
): PathPart[] | Unresolved | null {
  const node = unwrap(receiver);
  if (depth > 2) return { unresolved: "the client is resolved too indirectly" };
  if (ts.isCallExpression(node)) {
    if (calleeName(node) !== CLIENT_FOR) return null;
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
  if (!declaration) return null;
  if (ts.isParameter(declaration)) {
    // A client the module handed its own sub-factory is still the module's.
    // One handed in from anywhere else belongs to the caller: that body is the
    // caller's helper, not an operation a dispatcher could ever reach.
    const supplied = context.substitutions.get(node.text);
    return supplied ? clientRoot(supplied, context, depth + 1) : null;
  }
  if (!declaration.initializer) return null;
  if (isBaseRooted(declaration.initializer)) return [];
  return clientRoot(declaration.initializer, context, depth + 1);
}
