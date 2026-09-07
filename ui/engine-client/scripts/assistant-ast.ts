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
 * The identifier a value expression names: `x`, `x.toString()` and `String(x)`
 * all denote the parameter `x`. Nothing else resolves — a computed value would
 * make the derived route a guess.
 */
export function namedValue(expression: ts.Expression): string | null {
  const inner = unwrap(expression);
  if (ts.isIdentifier(inner)) return inner.text;
  if (!ts.isCallExpression(inner) || inner.arguments.length > 1) return null;
  const callee = unwrap(inner.expression);
  if (
    ts.isIdentifier(callee) &&
    callee.text === "String" &&
    inner.arguments.length === 1
  ) {
    return namedValue(inner.arguments[0]);
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "toString" &&
    inner.arguments.length === 0
  ) {
    return namedValue(callee.expression);
  }
  return null;
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
