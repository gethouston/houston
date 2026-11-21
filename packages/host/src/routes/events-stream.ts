import type { ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";
import { openSSE } from "../sse";
import { json } from "./http";
import { defineRoute } from "./registry";

function handleEventStream(
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
