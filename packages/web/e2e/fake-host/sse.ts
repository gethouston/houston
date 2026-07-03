/**
 * Server-Sent Events helpers for the fake host.
 *
 * The new engine streams over SSE (not WebSocket): the chat turn rides
 * `GET /conversations/:id/events` and the global reactivity feed rides
 * `GET /v1/events`. Both are `fetch` + ReadableStream on the client (see
 * packages/runtime-client/src/client.ts `streamEvents` and
 * packages/web/src/engine-adapter/control-plane.ts `subscribeEvents`), framing
 * on `\n\n` and reading only `data:` lines. Conversation frames are encoded by
 * the SAME `formatSseFrame` the real servers use (id: <seq> resume line +
 * data: envelope) so the wire can't drift from the contract.
 */
import { formatSseFrame, type WireFrame } from "@houston/runtime-client";

const encoder = new TextEncoder();

/** A live SSE connection we can push frames onto and close. */
export interface SseSink {
  /** One conversation wire frame, encoded via the shared `formatSseFrame`. */
  frame(frame: WireFrame): void;
  /** A non-conversation `data:` payload (the /v1/events domain feed). */
  data(payload: unknown): void;
  /** A `: <text>` comment frame — connection notices + heartbeats. */
  comment(text: string): void;
  close(): void;
  /** Run `fn` when the connection ends (client abort, drop, or close()). */
  onClose(fn: () => void): void;
  readonly closed: boolean;
}

/**
 * Build a streaming `Response` plus a sink to drive it. `onOpen` runs once the
 * stream starts (send the initial `: connected` / `sync` here). `req.signal`
 * aborting (client navigated away / aborted the turn) closes it.
 */
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
      } catch {
        /* already closed */
      }
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
      // The chat stream carries an Authorization header (runtime client), so the
      // browser preflights and needs the grant on the streamed response too.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
