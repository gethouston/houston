import ts from "typescript";
import { unwrap, valueExpression } from "./assistant-ast.ts";
import {
  boundParameter,
  callerSupplied,
  type ValueScope,
} from "./assistant-value-scope.ts";

export interface QueryEntry {
  key: string;
  name: string;
}

function readPath(expression: ts.Expression): string | null {
  const keys: string[] = [];
  let node = valueExpression(expression);
  while (ts.isPropertyAccessExpression(node)) {
    keys.unshift(node.name.text);
    node = unwrap(node.expression);
  }
  return ts.isIdentifier(node) ? [node.text, ...keys].join(".") : null;
}

function guardSubject(condition: ts.Expression): string | null {
  const node = unwrap(condition);
  if (!ts.isBinaryExpression(node)) return readPath(node);
  const operator = node.operatorToken.kind;
  if (
    operator !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    operator !== ts.SyntaxKind.ExclamationEqualsToken
  )
    return null;
  const right = unwrap(node.right);
  const nullish =
    (ts.isIdentifier(right) && right.text === "undefined") ||
    right.kind === ts.SyntaxKind.NullKeyword;
  return nullish ? readPath(node.left) : null;
}

type Guard =
  | { kind: "none" }
  | { kind: "if"; condition: ts.Expression }
  | { kind: "unsupported" };

function guardOf(call: ts.CallExpression, body: ts.Node): Guard {
  let node: ts.Node = call;
  let guard: Guard = { kind: "none" };
  while (node !== body && node.parent) {
    const parent = node.parent;
    if (ts.isExpressionStatement(parent) || ts.isBlock(parent)) {
      node = parent;
      continue;
    }
    if (
      ts.isIfStatement(parent) &&
      parent.thenStatement === node &&
      guard.kind === "none"
    ) {
      guard = { kind: "if", condition: parent.expression };
      node = parent;
      continue;
    }
    return { kind: "unsupported" };
  }
  return guard;
}

export function entriesAfterSet(
  call: ts.CallExpression,
  entries: readonly QueryEntry[],
  body: ts.Node,
  scope: ValueScope,
): QueryEntry[] | null {
  const [keyArgument, valueArgument] = call.arguments;
  if (!keyArgument || !valueArgument) return null;
  const literal = unwrap(keyArgument);
  if (!ts.isStringLiteral(literal)) return null;
  const guard = guardOf(call, body);
  if (guard.kind === "unsupported") return null;
  if (guard.kind === "if") {
    const subject = guardSubject(guard.condition);
    if (subject === null || subject !== readPath(valueArgument)) return null;
  }
  const parameter = boundParameter(valueArgument, scope);
  if (parameter !== null)
    return [...entries, { key: literal.text, name: parameter }];
  return callerSupplied(valueExpression(valueArgument), scope)
    ? null
    : [...entries];
}
