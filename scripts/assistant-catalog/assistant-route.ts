import ts from "typescript";
import { calleeName, isBareCall } from "./assistant-ast.ts";
import type { AssistantRoute } from "./assistant-catalog-types.ts";
import {
  type ClientHop,
  clientHop,
  type HopContext,
  isUnresolved,
} from "./assistant-client-hop.ts";
import type { Declaration, FileSurface } from "./assistant-declarations.ts";
import { hopRoute } from "./assistant-hop-route.ts";
import { type PathHelper, resolvePath } from "./assistant-path-parts.ts";
import { searchParamsIn } from "./assistant-query-params.ts";
import { extractInit, toPathTemplate } from "./assistant-route-args.ts";
import { TRANSPORTS } from "./assistant-transport-wrapper.ts";
import { NO_LOCALS, type ValueScope } from "./assistant-value-scope.ts";

export type RouteResult =
  | {
      route: AssistantRoute;
      reason: null;
      /**
       * What the ROUTE answers with, when that is not the declaration's own
       * return type — a request made a hop deeper answers the sub-client
       * method's shape, whatever the SDK wrapper does with it afterwards.
       * `null` for a direct call, whose declaration already says.
       */
      returns: ts.Type | null;
    }
  | { route: null; reason: string; returns: null };

const unroutable = (reason: string): RouteResult => ({
  route: null,
  reason,
  returns: null,
});

export interface RouteContext {
  surface: FileSurface;
  /** Path helpers shared across files (`agentPath` from the transport module). */
  shared: Map<string, PathHelper>;
  /** Type resolution for a request made through a runtime-client sub-client. */
  hops: Omit<HopContext, "parameters" | "substitutions">;
}

interface Request {
  call: ts.CallExpression;
  path: ts.Expression;
  init: ts.Expression | undefined;
  /** Set when the request is made one call deeper, inside a sub-client. */
  hop?: ClientHop;
}

/**
 * The one request a body makes: a direct transport call `(scope, path, init?)`,
 * a call to a private wrapper that makes it, or a call into a
 * `@houston/runtime-client` sub-client the module resolved, which makes it a
 * hop deeper. All three reach the same wire, so a method must contain exactly
 * ONE of them combined.
 */
function soleRequest(
  declaration: Declaration,
  parameters: Set<string>,
  context: RouteContext,
): Request | string {
  const requests: Request[] = [];
  const unresolvedHops: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const wrapper =
        callee === null ? undefined : context.surface.wrappers.get(callee);
      if (callee !== null && TRANSPORTS.has(callee)) {
        const [, path, init] = node.arguments;
        if (path) requests.push({ call: node, path, init });
      } else if (wrapper) {
        const index = wrapper.initParameter;
        requests.push({
          call: node,
          path: node,
          init: index === null ? undefined : node.arguments[index],
        });
      } else {
        const hop = clientHop(node, {
          ...context.hops,
          parameters,
          substitutions: declaration.substitutions,
        });
        if (isUnresolved(hop)) unresolvedHops.push(hop.unresolved);
        else if (hop)
          requests.push({ call: node, path: node, init: undefined, hop });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.body);
  const [only, ...rest] = requests;
  if (requests.length === 0 && unresolvedHops.length > 0)
    return unresolvedHops[0];
  if (!only) return "no request call";
  if (rest.length > 0 || unresolvedHops.length > 0)
    return "multiple request calls";
  return only;
}

/** Every path helper visible while resolving one file's templates. */
function helpersFor(context: RouteContext): Map<string, PathHelper> {
  const helpers = new Map<string, PathHelper>(context.shared);
  for (const [name, helper] of context.surface.helpers)
    helpers.set(name, helper);
  for (const [name, wrapper] of context.surface.wrappers)
    helpers.set(name, wrapper);
  return helpers;
}

/**
 * The route a declaration takes, or the reason it cannot be derived. It
 * qualifies when the body makes EXACTLY ONE request — at any nesting, so
 * `try`/`catch`, `if`, `Promise.all` and `const` assignment all count — whose
 * path is built only from literals and escaped parameters and whose options
 * name a literal verb and a parameter-shaped body. Anything else yields
 * `route: null` with its reason rather than a guess.
 *
 * A direct call site builds its path under the transport's own contract
 * (literals plus `encodeURIComponent(<parameter>)`), so nothing else is
 * resolved for it: a computed path here is a call site to fix, not a template
 * to decode.
 */
export function extractRoute(
  declaration: Declaration,
  parameters: Set<string>,
  context: RouteContext,
): RouteResult {
  const request = soleRequest(declaration, parameters, context);
  if (typeof request === "string") return unroutable(request);
  if (request.hop)
    return hopRoute(
      declaration,
      request.call,
      request.hop,
      parameters,
      context.hops.checker,
    );
  const scope: ValueScope = {
    parameters,
    bindings: new Map(),
    locals: NO_LOCALS,
  };
  const parts = resolvePath(request.path, {
    ...scope,
    helpers: helpersFor(context),
    searchParams: searchParamsIn(declaration.body, scope),
    depth: 0,
  });
  if (typeof parts === "string") return unroutable(parts);
  const template = toPathTemplate(parts);
  if (typeof template === "string") return unroutable(template);
  const init = extractInit(request.init, scope);
  if (typeof init === "string") return unroutable(init);
  return {
    route: {
      method: init.method,
      path: template.path,
      pathParams: template.pathParams,
      query: template.query,
      body: init.body,
      bodyFields: init.bodyFields,
      rawResponse: !isBareCall(declaration.body, request.call),
    },
    reason: null,
    returns: null,
  };
}
