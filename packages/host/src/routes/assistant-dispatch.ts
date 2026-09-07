import { Value } from "typebox/value";
import type {
  AssistantCatalog,
  AssistantHttpMethod,
} from "../assistant/catalog";
import { findVisibleOperation } from "../assistant/catalog";
import {
  type AssistantDispatchCode,
  type AssistantRefusal,
  arg,
  buildBody,
  buildPath,
  buildQuery,
  refuse,
} from "./assistant-request-parts";

/**
 * Catalog -> one outbound host request. The generated catalog carries the route
 * each adapter operation takes, so this builds the call instead of a
 * hand-written table restating it: annotate an operation, regenerate, done.
 *
 * Catalog paths are FULL host paths and nothing is prepended to them. The
 * adapter sends exactly these paths (`cp/fetch.ts` concatenates `baseUrl` and
 * the path, adding no base of its own), and the local host and the gateway
 * serve that one surface — so a base spliced in here would invent a second
 * dialect that neither of them answers.
 *
 * Fail closed at every step — an operation that is absent, hidden, or carries
 * no derivable route is refused here, so a sandbox token can never reach a
 * surface the generator did not deliberately publish.
 */

export interface AssistantUpstreamRequest {
  method: AssistantHttpMethod;
  /** The host path: placeholders substituted and escaped. */
  path: string;
  query: Record<string, string>;
  /** Absent when the operation sends no JSON body. */
  body?: unknown;
}

export type { AssistantDispatchCode };

export type AssistantDispatch =
  | { ok: true; request: AssistantUpstreamRequest }
  | AssistantRefusal;

/**
 * Build the gateway request for one named operation, or the refusal that
 * replaces it. `params` are the catalog's named arguments as the caller sent
 * them; the runtime already schema-checks them, so the checks here exist for
 * anything that reaches the route directly.
 */
export function dispatchAssistantOperation(
  catalog: AssistantCatalog,
  operation: string,
  params: Record<string, unknown>,
): AssistantDispatch {
  const op = findVisibleOperation(catalog, operation);
  if (!op?.route) {
    return refuse(
      "operation_not_supported",
      `this host does not perform "${operation}"`,
    );
  }
  const missing = op.params.find(
    (param) => param.required && arg(params, param.name) === undefined,
  );
  if (missing) {
    return refuse("invalid_params", `"${missing.name}" is required`);
  }
  // The runtime checks arguments against these same schemas before calling, so
  // reaching this means a direct caller: a second, independent gate rather than
  // trust that the least-trusted process validated its own request.
  const mistyped = op.params.find((param) => {
    const value = arg(params, param.name);
    return value !== undefined && !Value.Check(param.schema, value);
  });
  if (mistyped) {
    return refuse(
      "invalid_params",
      `"${mistyped.name}" is not a value ${op.name} accepts`,
    );
  }

  const path = buildPath(op.route, params);
  if (!path.ok) return path.refusal;
  const query = buildQuery(op.route, params);
  if (!query.ok) return query.refusal;

  const body = buildBody(op.route, params);
  return {
    ok: true,
    request: {
      method: op.route.method,
      path: path.value,
      query: query.value,
      ...(body !== undefined ? { body } : {}),
    },
  };
}
