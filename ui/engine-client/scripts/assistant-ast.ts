import ts from "typescript";

/** Strip the wrappers that never change what an expression denotes. */
export function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAwaitExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current)
  )
    current = current.expression;
  return current;
}

/**
 * The trailing name of a call's callee — `f`, `ns.f` and `this.f` all read as
 * `"f"`. The qualifier is deliberately ignored: the tables this feeds are
 * scoped to one file, so a bare, namespaced and `this.`-qualified call to the
 * same helper must resolve identically.
 */
export function calleeName(call: ts.CallExpression): string | null {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/**
 * Whether a function body is nothing but `return`/`await` of one call — the
 * signal that a caller driving the route directly gets exactly what the
 * function returns, with no post-processing in between.
 */
export function isBareCall(body: ts.Node, call: ts.CallExpression): boolean {
  if (!ts.isBlock(body)) return ts.isExpression(body) && unwrap(body) === call;
  const [statement, ...rest] = body.statements;
  if (!statement || rest.length > 0) return false;
  const expression =
    ts.isReturnStatement(statement) && statement.expression
      ? statement.expression
      : ts.isExpressionStatement(statement)
        ? statement.expression
        : undefined;
  return expression !== undefined && unwrap(expression) === call;
}

export function isUndefined(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === "undefined";
}

/** The text of a plain string literal, or `null` for anything else. */
export function stringLiteralText(expression: ts.Expression): string | null {
  const inner = unwrap(expression);
  return ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)
    ? inner.text
    : null;
}

/**
 * The value an expression carries, with the two stringifications that change
 * nothing about WHICH value it is stripped off: `x.toString()` and `String(x)`
 * both carry `x`. Anything else is returned as it stands.
 */
export function valueExpression(expression: ts.Expression): ts.Expression {
  const inner = unwrap(expression);
  if (!ts.isCallExpression(inner) || inner.arguments.length > 1) return inner;
  const callee = unwrap(inner.expression);
  if (
    ts.isIdentifier(callee) &&
    callee.text === "String" &&
    inner.arguments.length === 1
  ) {
    return valueExpression(inner.arguments[0]);
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "toString" &&
    inner.arguments.length === 0
  ) {
    return valueExpression(callee.expression);
  }
  return inner;
}

/**
 * The identifier a value expression names: `x`, `x.toString()` and `String(x)`
 * all denote the parameter `x`. Nothing else resolves — a computed value would
 * make the derived route a guess.
 */
export function namedValue(expression: ts.Expression): string | null {
  const value = valueExpression(expression);
  return ts.isIdentifier(value) ? value.text : null;
}

/** The single-expression body of an arrow, or `null` when it has a block. */
export function arrowExpressionBody(
  node: ts.Node,
): { parameters: string[]; template: ts.Expression } | null {
  if (!ts.isArrowFunction(node) || ts.isBlock(node.body)) return null;
  const parameters: string[] = [];
  for (const parameter of node.parameters) {
    if (!ts.isIdentifier(parameter.name)) return null;
    parameters.push(parameter.name.text);
  }
  return { parameters, template: node.body };
}
