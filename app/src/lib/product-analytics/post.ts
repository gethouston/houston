import { isAbortError, timeoutSignal } from "@houston/sdk/abort-signal";
import type { GatewayFetchDeps, GatewayRequestInit } from "../gateway-fetch.ts";
import type {
  ProductAnalyticsContext,
  ProductAnalyticsEvent,
  ProductAnalyticsSendOptions,
  ProductAnalyticsSendResult,
  RejectedProductEvent,
} from "./wire.ts";

export const PRODUCT_EVENTS_ROUTE = "/v1/analytics/events";

const REQUEST_TIMEOUT_MS = 15_000;

export interface ProductEventsPostDeps {
  gateway(): GatewayFetchDeps | null;
  context(): ProductAnalyticsContext;
  send(
    deps: GatewayFetchDeps,
    path: string,
    init: GatewayRequestInit,
  ): Promise<Response | null>;
  isOffline(error: unknown): boolean;
  report(message: string, detail?: unknown): void;
  timeoutSignal?(): AbortSignal;
}

export function createProductEventsPost(
  deps: ProductEventsPostDeps,
): (
  events: readonly ProductAnalyticsEvent[],
  options?: ProductAnalyticsSendOptions,
) => Promise<ProductAnalyticsSendResult> {
  const reportedOnce = new Set<string>();
  const reportOnce = (key: string, message: string, detail?: unknown) => {
    if (reportedOnce.has(key)) return;
    reportedOnce.add(key);
    deps.report(message, detail);
  };

  return async function post(events, options) {
    const gateway = deps.gateway();
    if (!gateway) return { status: "no-session" };
    let res: Response | null;
    try {
      res = await deps.send(gateway, PRODUCT_EVENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: deps.context(), events }),
        ...(options?.final ? { keepalive: true } : {}),
        signal: deps.timeoutSignal?.() ?? timeoutSignal(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (!deps.isOffline(error) && !isAbortError(error)) {
        reportOnce(
          "post-failed",
          "the product-analytics POST failed unexpectedly",
          error,
        );
      }
      return { status: "failed" };
    }
    if (!res) return { status: "no-session" };
    if (res.status === 404) {
      reportOnce(
        "route-missing",
        `the product-analytics ingest answered 404 (${PRODUCT_EVENTS_ROUTE})`,
      );
      return { status: "ok" };
    }
    if (!res.ok) return { status: "failed" };
    return {
      status: "ok",
      rejected: await readRejected(
        res,
        (error) => deps.isOffline(error) || isAbortError(error),
        reportOnce,
      ),
    };
  };
}

async function readRejected(
  res: Response,
  isDropped: (error: unknown) => boolean,
  reportOnce: (key: string, message: string, detail?: unknown) => void,
): Promise<readonly RejectedProductEvent[]> {
  try {
    const body = (await res.json()) as { rejected?: unknown };
    if (!Array.isArray(body.rejected)) return [];
    return body.rejected.filter(isRejectedEvent);
  } catch (error) {
    if (isDropped(error)) return [];
    reportOnce(
      "unreadable-body",
      "the product-analytics ingest answered with a body we cannot read",
      error,
    );
    return [];
  }
}

function isRejectedEvent(value: unknown): value is RejectedProductEvent {
  if (typeof value !== "object" || value === null) return false;
  const { id, reason } = value as { id?: unknown; reason?: unknown };
  return typeof id === "string" && typeof reason === "string";
}
