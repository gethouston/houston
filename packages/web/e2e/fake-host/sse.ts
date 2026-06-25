/**
 * Server-Sent Events helpers for the fake host.
 *
 * The new engine streams over SSE (not WebSocket): the chat turn rides
 * `GET /conversations/:id/events` and the global reactivity feed rides
 * `GET /v1/events`. Both are `fetch` + ReadableStream on the client (see
 * packages/runtime-client/src/client.ts `streamEvents` and
 * packages/web/src/engine-adapter/control-plane.ts `subscribeEvents`), framing
 * on `\n\n` and reading only `data:` lines. We mirror that wire exactly.
 */
const encoder = new TextEncoder();

/** A `data: <json>` frame, the unit both client readers parse. */
export function dataFrame(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** A `: <text>` comment frame — connection notices + heartbeats. Clients skip
 *  any frame without a `data:` line, so these keep the stream warm harmlessly. */
export function commentFrame(text: string): Uint8Array {
  return encoder.encode(`: ${text}\n\n`);
}

/** A live SSE connection we can push frames onto and close. */
export interface SseSink {
  push(payload: unknown): void;
  comment(text: string): void;
  close(): void;
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

  const sink: SseSink = {
    push(payload) {
      if (!closed && controller) controller.enqueue(dataFrame(payload));
    },
    comment(text) {
      if (!closed && controller) controller.enqueue(commentFrame(text));
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller?.close();
      } catch {
        /* already closed */
      }
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
