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

export interface AssistantUpstreamRequest {
  method: AssistantHttpMethod;
  path: string;
  query: Record<string, string>;
  body?: unknown;
}

export type { AssistantDispatchCode };

export type AssistantDispatch =
  | { ok: true; request: AssistantUpstreamRequest }
  | AssistantRefusal;

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
