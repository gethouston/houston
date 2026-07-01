import type { ServerResponse } from "node:http";

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
    send(type: string, data: unknown) {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
