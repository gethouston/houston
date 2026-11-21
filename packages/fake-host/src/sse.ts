import { formatSseFrame, type WireFrame } from "@houston/runtime-client";

const encoder = new TextEncoder();

export interface SseSink {
  frame(frame: WireFrame): void;
  data(payload: unknown): void;
  comment(text: string): void;
  close(): void;
  onClose(fn: () => void): void;
  readonly closed: boolean;
}

export function sseResponse(
  req: Request,
  onOpen: (sink: SseSink) => void,
): Response {
  let closed = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const closeHooks: Array<() => void> = [];

  const write = (text: string) => {
    if (!closed && controller) controller.enqueue(encoder.encode(text));
  };
  const runCloseHooks = () => {
    while (closeHooks.length > 0) closeHooks.pop()?.();
  };
  const sink: SseSink = {
    frame(frame) {
      write(formatSseFrame(frame));
    },
    data(payload) {
      write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    comment(text) {
      write(`: ${text}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller?.close();
      } catch {}
      runCloseHooks();
    },
    onClose(fn) {
      if (closed) fn();
      else closeHooks.push(fn);
    },
    get closed() {
      return closed;
    },
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      const onAbort = () => sink.close();
      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener("abort", onAbort);
      onOpen(sink);
    },
    cancel() {
      closed = true;
      runCloseHooks();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
