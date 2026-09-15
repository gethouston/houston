import ts from "typescript";
import { namedValue, unwrap } from "./assistant-ast.ts";
import type { PathEncoding } from "./assistant-catalog-types.ts";

/**
 * What a value expression may read while a route is derived.
 *
 * One operation's request can be assembled two hops away from its own
 * signature: the SDK method passes its arguments to a `@houston/runtime-client`
 * method, and THAT method builds the path and body. So every resolver works
 * against a scope rather than a bare parameter list — the callee's parameters
 * bound to what the caller actually passed, plus every `const` the callee body
 * can read.
 */

/**
 * One piece of a resolved path template: fixed text, a parameter slot, or a
 * query key the request carries only when its parameter was supplied (see
 * ./assistant-query-params.ts). A query part renders no text - it is folded
 * into the route's `query` map instead.
 */
export type PathPart =
  | { kind: "text"; text: string }
  | { kind: "param"; name: string; encoding: PathEncoding }
  | { kind: "query"; key: string; name: string };

/**
 * What a call site binds one callee parameter to: the operation parameter it
 * forwards, the fixed parts it fills it with, or `opaque` — a value the caller
 * DID pass that nothing static can describe. Opaque is not the same as unbound:
 * an unbound parameter is one the caller omitted, so a default it guards is the
 * only value the request can carry, while an opaque one could be anything.
 */
export type Binding =
  | { kind: "param"; name: string }
  | { kind: "parts"; parts: PathPart[] }
  | { kind: "opaque" };

export interface ValueScope {
  /** The operation's own parameter names — all a route may read. */
  parameters: Set<string>;
  /** Callee parameter -> what its caller passed. Empty at the top level. */
  bindings: Map<string, Binding>;
  /** The initializer a `const` name has where the body is resolved. */
  locals: (name: string) => ts.Expression | null;
}

/** An empty scope for a file with no constants and no local resolution. */
export const NO_LOCALS = (): null => null;

/**
 * The parameter an expression denotes, following one level of binding. A
 * callee parameter bound to fixed text is not a parameter — it is text, and
 * the caller handles that case separately.
 */
export function boundParameter(
  expression: ts.Expression,
  scope: ValueScope,
): string | null {
  const name = namedValue(expression);
  if (name === null) return null;
  const binding = scope.bindings.get(name);
  if (binding) return binding.kind === "param" ? binding.name : null;
  return scope.parameters.has(name) ? name : null;
}

/** The parts a bound callee parameter stands for, when it is bound to parts. */
export function bindingParts(
  expression: ts.Expression,
  scope: ValueScope,
): PathPart[] | null {
  const inner = unwrap(expression);
  if (!ts.isIdentifier(inner)) return null;
  const binding = scope.bindings.get(inner.text);
  return binding?.kind === "parts" ? binding.parts : null;
}

/** The identifier an access chain is rooted at: `opts?.provider` -> `opts`. */
function rootIdentifier(expression: ts.Expression): string | null {
  let node = unwrap(expression);
  while (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  )
    node = unwrap(node.expression);
  return ts.isIdentifier(node) ? node.text : null;
}

/**
 * Whether an expression reads a value the OPERATION's caller supplied.
 *
 * This is what makes a default honest. `opts?.provider ?? "composio"` carries
 * the literal when the caller passed no `opts` at all — the branch that would
 * override it is unreachable from the operation's signature — and carries
 * something unknowable the moment the caller does pass one.
 */
export function callerSupplied(
  expression: ts.Expression,
  scope: ValueScope,
): boolean {
  const root = rootIdentifier(expression);
  if (root === null) return true;
  return scope.bindings.has(root) || scope.parameters.has(root);
}

/**
 * The operation parameter a body value reads: the parameter itself, or one of
 * its fields reached by plain (or optional) property access — `seed?.claudeMd`
 * reads as `"seed.claudeMd"`. A callee parameter resolves through its binding,
 * so a forwarded `title` names the operation's `title`. Anything computed
 * resolves to `null`.
 */
export function parameterReference(
  expression: ts.Expression,
  scope: ValueScope,
): string | null {
  const keys: string[] = [];
  let node = unwrap(expression);
  while (ts.isPropertyAccessExpression(node)) {
    keys.unshift(node.name.text);
    node = unwrap(node.expression);
  }
  if (!ts.isIdentifier(node)) return null;
  const binding = scope.bindings.get(node.text);
  if (binding)
    return binding.kind === "param" ? [binding.name, ...keys].join(".") : null;
  return scope.parameters.has(node.text)
    ? [node.text, ...keys].join(".")
    : null;
}

/**
 * Every `const x = …` initializer a body may read, by name: the ones declared
 * inside it, then the module's own. The body wins — a local shadows a module
 * constant exactly as it does at runtime.
 */
export function localInitializers(
  body: ts.Node,
  source: ts.SourceFile,
): (name: string) => ts.Expression | null {
  const locals = new Map<string, ts.Expression>();
  const record = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !locals.has(node.name.text)
    )
      locals.set(node.name.text, node.initializer);
    ts.forEachChild(node, record);
  };
  record(body);
  for (const statement of source.statements)
    if (ts.isVariableStatement(statement)) record(statement);
  return (name) => locals.get(name) ?? null;
}
