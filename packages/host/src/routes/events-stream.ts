import type { ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";
import { openSSE } from "../sse";

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
