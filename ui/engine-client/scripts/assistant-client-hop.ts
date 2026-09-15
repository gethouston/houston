import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import { clientRoot } from "./assistant-client-root.ts";
import type { PathPart } from "./assistant-value-scope.ts";

/**
 * The runtime-client hop: an SDK method whose request is made one call deeper.
 *
 * `@houston/runtime-client` owns the path literals for everything an SDK module
 * reads or writes through a sub-client (`IntegrationsClient`,
 * `PreferencesClient`, `HoustonEngineClient`), so the SDK method that a caller
 * dispatches is two hops from the wire: method -> client method ->
 * `this.r.request(...)`. Following that hop is what makes those capabilities
 * visible at all; the operation, and its `@assistant` annotation, stays on the
 * SDK side.
 *
 * A client the operation was HANDED (a parameter) is deliberately not a hop:
 * the function is a helper of whoever owns the client, and the operation is its
 * caller. Only a client the module itself resolved counts.
 */

/** The transport inside a sub-client: `this.r.json(path, init)`. */
const REQUESTERS: ReadonlySet<string> = new Set(["json", "request"]);

export interface HopContext {
  checker: ts.TypeChecker;
  /** Files whose classes are the sub-clients a hop may land in. */
  resolvers: ReadonlySet<string>;
  /** The operation's own parameter names — all a root prefix may read. */
  parameters: Set<string>;
  /**
   * What the factory enclosing the operation was called with, by parameter
   * name. A sub-factory (`createIntegrationsWrites(client, run)`) reads the
   * module's client as its own parameter, and only its call site says the
   * client is rooted at the engine base.
   */
  substitutions: Map<string, ts.Expression>;
}

export interface ClientHop {
  /** The sub-client method the operation's call lands in. */
  method: ts.MethodDeclaration;
  /** The prefix the client's base URL contributes, already resolved. */
  root: PathPart[];
}

/** Why something a request depends on could not be derived. */
export interface Unresolved {
  unresolved: string;
}

/** A hop that landed in a sub-client but whose root cannot be composed. */
export type HopResult = ClientHop | Unresolved | null;

export function isUnresolved(value: object | null): value is Unresolved {
  return value !== null && "unresolved" in value;
}

/** The sub-client method a call lands in, when it lands in one. */
function resolverMethod(
  call: ts.CallExpression,
  context: HopContext,
): ts.MethodDeclaration | null {
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const type = context.checker.getTypeAtLocation(callee.expression);
  const property = context.checker.getPropertyOfType(type, callee.name.text);
  const declaration = property?.getDeclarations()?.[0];
  if (!declaration || !ts.isMethodDeclaration(declaration)) return null;
  return context.resolvers.has(declaration.getSourceFile().fileName)
    ? declaration
    : null;
}

/** `<Class>.<method>` — the sub-client method a hop lands in, as a reader sees it. */
function hopName(method: ts.MethodDeclaration): string {
  const owner = method.parent;
  const client =
    (ts.isClassDeclaration(owner) || ts.isClassExpression(owner)) && owner.name
      ? owner.name.text
      : "the client";
  return `${client}.${method.name.getText(method.getSourceFile())}`;
}

/**
 * The hop a call makes, or `null` when it makes none. A call that lands in a
 * sub-client but whose client root cannot be composed answers `unresolved`: it
 * IS the operation's request, so it must be reported rather than skipped.
 */
export function clientHop(
  call: ts.CallExpression,
  context: HopContext,
): HopResult {
  const method = resolverMethod(call, context);
  if (!method) return null;
  const callee = unwrap(call.expression) as ts.PropertyAccessExpression;
  const root = clientRoot(callee.expression, context);
  if (root === null) return null;
  // Named here rather than inside the resolver: the reason reaches an author
  // who is reading the SDK method, and the sub-client it dispatches into is the
  // one fact that method's own text does not show.
  if (isUnresolved(root))
    return {
      unresolved: `hop into ${hopName(method)} could not be resolved: ${root.unresolved}`,
    };
  return { method, root };
}

/** The single `this.r.json(path, init)` a sub-client method issues. */
export function requesterCall(
  method: ts.MethodDeclaration,
): ts.CallExpression | string {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const name = calleeName(node);
      if (
        name !== null &&
        REQUESTERS.has(name) &&
        ts.isPropertyAccessExpression(callee) &&
        rootsAtThis(callee.expression)
      )
        calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
  const [only, ...rest] = calls;
  if (!only) return "the client method issues no request";
  if (rest.length > 0) return "the client method issues several requests";
  return only;
}

/** `this` or `this.r` — the requester a sub-client owns. */
function rootsAtThis(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
  return ts.isPropertyAccessExpression(node) && rootsAtThis(node.expression);
}
