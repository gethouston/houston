import ts from "typescript";

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

export function calleeName(call: ts.CallExpression): string | null {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

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

export function stringLiteralText(expression: ts.Expression): string | null {
  const inner = unwrap(expression);
  return ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)
    ? inner.text
    : null;
}

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

export function namedValue(expression: ts.Expression): string | null {
  const value = valueExpression(expression);
  return ts.isIdentifier(value) ? value.text : null;
}

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
