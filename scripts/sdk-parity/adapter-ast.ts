import ts from "typescript";

/**
 * A copy of `unwrap` from `ui/engine-client/scripts/assistant-ast.ts`.
 *
 * Copied rather than imported because the two script trees resolve different
 * `typescript` packages, so their `ts.Expression` types are distinct and an
 * imported helper's parameter rejects this file's nodes.
 */

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
