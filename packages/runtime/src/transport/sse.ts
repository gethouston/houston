import type { ServerResponse } from "node:http";
import { formatSseFrame, type WireFrame } from "@houston/runtime-client";

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
  }, 15_000);
  res.on("close", () => clearInterval(heartbeat));

  return {
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
