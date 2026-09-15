/**
 * Where client product events land: the gateway's `/v1/analytics/events`
 * ingest, behind the same JWT wall and the same active-space pin as every
 * other gateway call (`gatewayFetch` — the ONE way app code talks to it).
 *
 * The batch is org-scoped: which space the user was working in is part of the
 * fact, and the gateway stamps `org_id` from the pin it resolved.
 */

import { analyticsSessionId } from "../analytics";
import { reportError } from "../error-report";
import { gatewayFetch, liveGatewayDeps } from "../gateway-fetch.ts";
import { getInstallId } from "../install-id";
import { osIsTauri } from "../os-bridge";
import { createProductAnalyticsContext } from "./context.ts";
import type {
  ProductAnalyticsEvent,
  ProductAnalyticsSendResult,
  RejectedProductEvent,
} from "./wire.ts";

const ROUTE = "/v1/analytics/events";

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/** This launch's device identity; the policy behind it is in `context.ts`. */
const productAnalyticsContext = createProductAnalyticsContext({
  sessionId: analyticsSessionId,
  appVersion: APP_VERSION,
  platform: () => (osIsTauri() ? "desktop" : "web"),
  readInstallId: async () => (await getInstallId()).id,
  onInstallIdFailure: (error) =>
    reportError("product-analytics", "the install id could not be read", error),
});

/**
 * POSTs one batch. Resolves rather than throws for every expected outcome, so
 * the queue decides what to do with each: hold (no session), retry (transport
 * or server failure), or move on.
 */
export async function sendProductEvents(
  events: readonly ProductAnalyticsEvent[],
): Promise<ProductAnalyticsSendResult> {
  const deps = liveGatewayDeps();
  // No gateway configured at all (a self-host / local build): nothing to
  // deliver to, and holding the batch is the honest answer.
  if (!deps) return { status: "no-session" };
  let res: Response | null;
  try {
    res = await gatewayFetch(deps, ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: productAnalyticsContext(), events }),
    });
  } catch {
    // Transport-shaped (offline, host unreachable) — worth exactly one retry.
    return { status: "failed" };
  }
  if (!res) return { status: "no-session" };
  // A host without the route (an older gateway, or the local sidecar a desktop
  // build points at): retrying can never succeed, so the batch moves on.
  if (res.status === 404) return { status: "ok" };
  if (!res.ok) return { status: "failed" };
  return { status: "ok", rejected: await readRejected(res) };
}

/** The 202 body's per-event verdicts; an unreadable body is still a success. */
async function readRejected(
  res: Response,
): Promise<readonly RejectedProductEvent[]> {
  try {
    const body = (await res.json()) as { rejected?: unknown };
    if (!Array.isArray(body.rejected)) return [];
    return body.rejected.filter(isRejectedEvent);
  } catch {
    return [];
  }
}

function isRejectedEvent(value: unknown): value is RejectedProductEvent {
  if (typeof value !== "object" || value === null) return false;
  const { id, reason } = value as { id?: unknown; reason?: unknown };
  return typeof id === "string" && typeof reason === "string";
}
