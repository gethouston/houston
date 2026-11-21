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
  shared: Map<string, PathHelper>;
  hops: Omit<HopContext, "parameters" | "substitutions">;
}

interface Request {
  call: ts.CallExpression;
  path: ts.Expression;
  init: ts.Expression | undefined;
  hop?: ClientHop;
}

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

function helpersFor(context: RouteContext): Map<string, PathHelper> {
  const helpers = new Map<string, PathHelper>(context.shared);
  for (const [name, helper] of context.surface.helpers)
    helpers.set(name, helper);
  for (const [name, wrapper] of context.surface.wrappers)
    helpers.set(name, wrapper);
  return helpers;
}

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
