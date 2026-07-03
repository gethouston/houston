import type { ServerResponse } from "node:http";
import { formatSseFrame, type WireFrame } from "@houston/runtime-client";

/** Open a Server-Sent Events stream on a response. */
export function openSSE(res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Flush each frame immediately — a trailing terminal `done` must not sit in a
  // Nagle buffer (the local-host proxy reads this socket frame-by-frame).
  res.socket?.setNoDelay?.(true);
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": hb\n\n");
  }, 15_000);
  res.on("close", () => clearInterval(heartbeat));

  return {
    /**
     * Write one wire frame (the whole envelope — type, data, seq, turnId). A
     * sequenced frame (conversation streams) gets an SSE `id: <seq>` line +
     * `seq` in the JSON envelope so a client can resume with
     * `?after=`/`Last-Event-ID`; heartbeats/comments are unaffected.
     */
    send(frame: WireFrame) {
      if (res.writableEnded) return;
      res.write(formatSseFrame(frame));
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
