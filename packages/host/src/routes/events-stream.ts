import type { ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";

/** Comment-frame heartbeat keeps proxies from idling the long-lived stream out. */
const HEARTBEAT_MS = 15_000;

/**
 * Open the global event stream for a user (SSE). Long-lived: it does not resolve
 * until the client disconnects. Strictly scoped to `userId` — a tenant receives
 * only their own agents' change events. Each frame is `data: <HoustonEvent JSON>`.
 */
export function handleEventStream(
  hub: EventHub,
  userId: UserId,
  res: ServerResponse,
  onClose: (cb: () => void) => void,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  // An immediate comment frame flushes headers so the client's reader resolves.
  res.write(": connected\n\n");

  const unsub = hub.subscribe(userId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": hb\n\n"), HEARTBEAT_MS);

  onClose(() => {
    clearInterval(heartbeat);
    unsub();
  });
}
