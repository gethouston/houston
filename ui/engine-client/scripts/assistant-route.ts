import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import type { AssistantRoute } from "./assistant-catalog-types.ts";
import {
  type Declaration,
  type FileSurface,
  TRANSPORTS,
} from "./assistant-declarations.ts";
import { type PathHelper, resolvePath } from "./assistant-path-parts.ts";
import { extractInit, toPathTemplate } from "./assistant-route-args.ts";

export type RouteResult =
  | { route: AssistantRoute; reason: null }
  | { route: null; reason: string };

const unroutable = (reason: string): RouteResult => ({ route: null, reason });

export interface RouteContext {
  surface: FileSurface;
  /** Path helpers shared across files (`agentPath` from the transport module). */
  shared: Map<string, PathHelper>;
}

interface Request {
  call: ts.CallExpression;
  path: ts.Expression;
  init: ts.Expression | undefined;
}

/**
 * The one request a body makes: a direct transport call `(scope, path, init?)`,
 * or a call to a private wrapper that makes it. Both reach the same transport,
 * so a method must contain exactly ONE of them combined.
 */
function soleRequest(
  declaration: Declaration,
  context: RouteContext,
): Request | string {
  const requests: Request[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      if (callee !== null && TRANSPORTS.has(callee)) {
        const [, path, init] = node.arguments;
        if (path) requests.push({ call: node, path, init });
      } else if (callee !== null) {
        const wrapper = context.surface.wrappers.get(callee);
        if (wrapper) {
          const index = wrapper.initParameter;
          requests.push({
            call: node,
            path: node,
            init: index === null ? undefined : node.arguments[index],
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.body);
  const [only, ...rest] = requests;
  if (!only) return "no request call";
  if (rest.length > 0) return "multiple request calls";
  return only;
}

/** Whether the body is nothing but `return`/`await` of the request. */
function isBareRequest(body: ts.Block, call: ts.CallExpression): boolean {
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
 */
export function extractRoute(
  declaration: Declaration,
  parameters: Set<string>,
  context: RouteContext,
): RouteResult {
  const request = soleRequest(declaration, context);
  if (typeof request === "string") return unroutable(request);
  const parts = resolvePath(request.path, {
    parameters,
    helpers: helpersFor(context),
    bindings: new Map(),
    depth: 0,
  });
  if (typeof parts === "string") return unroutable(parts);
  const template = toPathTemplate(parts);
  if (typeof template === "string") return unroutable(template);
  const init = extractInit(request.init, parameters);
  if (typeof init === "string") return unroutable(init);
  return {
    route: {
      method: init.method,
      path: template.path,
      pathParams: template.pathParams,
      query: template.query,
      body: init.body,
      bodyFields: init.bodyFields,
      rawResponse: !isBareRequest(declaration.body, request.call),
    },
    reason: null,
  };
}
