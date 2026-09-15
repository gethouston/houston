/**
 * The POST itself: one batch to the gateway's `/v1/analytics/events` ingest,
 * behind the same JWT wall and the same active-space pin as every other gateway
 * call (`gatewayFetch` — the ONE way app code talks to it). The batch is
 * org-scoped: which space the user was working in is part of the fact, and the
 * gateway stamps `org_id` from the pin it resolved.
 *
 * Dependency-injected end to end, so the delivery policy — the quit-time
 * keepalive, the timeout, what each answer means to the queue — is driven by
 * tests with no window and no network. `transport.ts` is the live wiring.
 */

import type { GatewayFetchDeps, GatewayRequestInit } from "../gateway-fetch.ts";
import type {
  ProductAnalyticsContext,
  ProductAnalyticsEvent,
  ProductAnalyticsSendOptions,
  ProductAnalyticsSendResult,
  RejectedProductEvent,
} from "./wire.ts";

export const PRODUCT_EVENTS_ROUTE = "/v1/analytics/events";

/** A request that never answers would own the pipe for the whole launch: the
 *  queue's `inFlight` would never clear and nothing would ship again. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface ProductEventsPostDeps {
  /** The live gateway target, or null while the engine globals are absent. */
  gateway(): GatewayFetchDeps | null;
  /** This batch's device identity. */
  context(): ProductAnalyticsContext;
  /** `gatewayFetch`. */
  send(
    deps: GatewayFetchDeps,
    path: string,
    init: GatewayRequestInit,
  ): Promise<Response | null>;
  /** Network-shaped throws (device offline, host unreachable): the one expected
   *  failure of a POST. Everything else is a bug and gets reported. */
  isOffline(error: unknown): boolean;
  /** Where the unexpected goes (`reportError`). */
  report(message: string, detail?: unknown): void;
  /** The per-request abort signal; injected so a test needs no real timer. */
  timeoutSignal?(): AbortSignal;
}

/**
 * Builds the sender for this launch. It resolves rather than throws for every
 * expected outcome, so the queue decides what to do with each: hold (no
 * session), retry (transport or server failure), or move on.
 */
export function createProductEventsPost(
  deps: ProductEventsPostDeps,
): (
  events: readonly ProductAnalyticsEvent[],
  options?: ProductAnalyticsSendOptions,
) => Promise<ProductAnalyticsSendResult> {
  // Each of these is a fact about the deployment, not about one batch: a
  // second report would say the same thing with a bigger count.
  const reportedOnce = new Set<string>();
  const reportOnce = (key: string, message: string, detail?: unknown) => {
    if (reportedOnce.has(key)) return;
    reportedOnce.add(key);
    deps.report(message, detail);
  };

  return async function post(events, options) {
    const gateway = deps.gateway();
    // The engine globals are not installed yet: the sink listens from above
    // <EngineGate>, so a batch can be minted before the app has an engine
    // target at all. Holding it is the honest answer — the next flush finds one.
    if (!gateway) return { status: "no-session" };
    let res: Response | null;
    try {
      res = await deps.send(gateway, PRODUCT_EVENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: deps.context(), events }),
        // The quit-time flush is the last ride anything buffered will get, and
        // without this the browser aborts it on pagehide. Every other flush
        // ships without it: keepalive caps the body at 64 KiB (see
        // `ProductAnalyticsSendOptions`), which a full batch can exceed.
        ...(options?.final ? { keepalive: true } : {}),
        signal: (deps.timeoutSignal ?? defaultTimeoutSignal)(),
      });
    } catch (error) {
      // Offline and the timeout above are expected states worth exactly one
      // retry. Anything else reaching here is a bug in this path.
      if (!deps.isOffline(error) && !isAbort(error)) {
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
      // A host without the route (an older gateway, or the local sidecar a
      // desktop build points at): retrying can never succeed, so the batch
      // moves on. On a managed-cloud client — the only client that runs this
      // pipe — the route is supposed to be there, so it is worth a report.
      reportOnce(
        "route-missing",
        `the product-analytics ingest answered 404 (${PRODUCT_EVENTS_ROUTE})`,
      );
      return { status: "ok" };
    }
    if (!res.ok) return { status: "failed" };
    return { status: "ok", rejected: await readRejected(res, reportOnce) };
  };
}

const defaultTimeoutSignal = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

/** The abort the timeout above raises, whatever the runtime names it. */
function isAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name } = error as { name?: unknown };
  return name === "TimeoutError" || name === "AbortError";
}

/** The 202 body's per-event verdicts; an unreadable body is still a success
 *  (the events are stored), so it is reported rather than retried. */
async function readRejected(
  res: Response,
  reportOnce: (key: string, message: string, detail?: unknown) => void,
): Promise<readonly RejectedProductEvent[]> {
  try {
    const body = (await res.json()) as { rejected?: unknown };
    if (!Array.isArray(body.rejected)) return [];
    return body.rejected.filter(isRejectedEvent);
  } catch (error) {
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
