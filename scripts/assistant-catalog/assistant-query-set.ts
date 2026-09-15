import ts from "typescript";
import { unwrap, valueExpression } from "./assistant-ast.ts";
import {
  boundParameter,
  callerSupplied,
  type ValueScope,
} from "./assistant-value-scope.ts";

/**
 * What ONE `params.set(key, value)` adds to an assembled query string, and when
 * it adds nothing at all.
 *
 * Read beside {@link searchParamsIn} (./assistant-query-params.ts), which finds
 * the locals these calls write to. The split is the two questions: that file
 * asks which names are a query, this one asks what a single write to one means.
 */

/** One query key, and the operation parameter whose value fills it. */
export interface QueryEntry {
  key: string;
  name: string;
}

/** The dotted read an expression names: `opts.limit` -> `"opts.limit"`. */
function readPath(expression: ts.Expression): string | null {
  const keys: string[] = [];
  let node = valueExpression(expression);
  while (ts.isPropertyAccessExpression(node)) {
    keys.unshift(node.name.text);
    node = unwrap(node.expression);
  }
  return ts.isIdentifier(node) ? [node.text, ...keys].join(".") : null;
}

/**
 * The value an `if` proves is present: `x`, `x !== undefined`, `x != null`.
 * `!x` and every other test is refused - it SELECTS a value rather than
 * guarding one, so the key it sets is not "this parameter, when the caller
 * gave it", which is the only shape the dispatcher's own omit rule matches.
 */
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

/** What guards one `.set` call: nothing, one `if`, or a shape no route holds. */
type Guard =
  | { kind: "none" }
  | { kind: "if"; condition: ts.Expression }
  | { kind: "unsupported" };

/**
 * The `if` a call sits under, walking out to the function body. Only plain
 * statement nesting and ONE `if`'s then-branch are read; a loop, an else, a
 * second `if` or an expression position means the key is set under a condition
 * that has nothing to do with whether its value was supplied.
 */
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

/**
 * One `q.set(key, value)` folded into the keys assembled so far, or `null` when
 * the write cannot be described at all.
 *
 * A key whose value the operation's caller cannot reach - a client-method
 * option no SDK caller passes - is DROPPED rather than refused: its guard never
 * opens, so the request never carries it and the route is complete without it.
 */
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
    // The guard must prove THIS value is present. Two unreadable expressions
    // are not a match, or `if (!deviceAuth) set("deviceAuth", "false")` would
    // read as an optional `deviceAuth` parameter that does not exist.
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
