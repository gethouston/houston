import type { ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";
import { openSSE } from "../sse";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * Open the global event stream for a user (SSE, via the shared host opener —
 * full header set + heartbeat). Long-lived: it does not resolve until the
 * client disconnects. Strictly scoped to `userId` — a tenant receives only
 * their own agents' change events. Each frame is `data: <HoustonEvent JSON>`.
 */
export function handleEventStream(
  hub: EventHub,
  userId: UserId,
  res: ServerResponse,
  onClose: (cb: () => void) => void,
): void {
  const sse = openSSE(res);
  const unsub = hub.subscribe(userId, (event) => sse.sendData(event));
  onClose(() => {
    unsub();
    sse.close();
  });
}

/**
 * The global reactivity stream. Long-lived: the handler returns as soon as the
 * stream is open and the response is never ended here — the client's
 * disconnect is what closes it.
 */
defineRoute({
  group: "events",
  method: "GET",
  path: "/v1/events",
  phase: "user",
  classification: "infra",
  reason:
    "Transport, not a resource: one SSE channel every client holds open, with no request payload of its own.",
  source: "packages/host/src/routes/events-stream.ts",
  handler: ({ deps, userId, req, res }) => {
    if (!deps.events) return json(res, 503, { error: "events not configured" });
    handleEventStream(deps.events, userId, res, (cb) => req.on("close", cb));
  },
});
