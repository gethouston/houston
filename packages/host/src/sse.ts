import type { ServerResponse } from "node:http";
import { formatSseFrame, type WireFrame } from "@houston/runtime-client";

/** Comment-frame heartbeat keeps proxies from idling long-lived streams out. */
const HEARTBEAT_MS = 15_000;

/**
 * Open a Server-Sent Events stream on a response — the ONE host-side SSE
 * opener (conversation event streams AND the global event stream), so every
 * stream gets the full header set: `no-transform` + `X-Accel-Buffering: no`
 * defeat proxy buffering, `setNoDelay` defeats Nagle (a trailing terminal
 * `done` must never sit in a kernel buffer), and the immediate comment frame
 * flushes headers so the client's reader resolves. Heartbeats run until the
 * stream closes.
 */
export function openSSE(res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.socket?.setNoDelay?.(true);
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": hb\n\n");
  }, HEARTBEAT_MS);
  res.on("close", () => clearInterval(heartbeat));

  return {
    /** Write one conversation wire frame (envelope `seq` → SSE `id:` line). */
    send(frame: WireFrame) {
      if (!res.writableEnded) res.write(formatSseFrame(frame));
    },
    /** Write one raw `data:` payload (the global HoustonEvent stream). */
    sendData(payload: unknown) {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
