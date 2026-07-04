/**
 * The fake host's chat request surface — the SSE subscribe endpoint and the
 * message POST — served from the SAME shared pieces as the real servers
 * (runtime `transport/events-route.ts`, host `turn/events-route.ts`):
 *
 * - `serveResumableStream` serves each connection: fresh connect → `sync`;
 *   `?after=<seq>` / `Last-Event-ID` → gap/dupe-free replay; unserviceable
 *   cursor → `sync` with `resync: true`.
 * - The turn produces into the replay log whether or not a stream is attached,
 *   just like the real runtime; the nonce is echoed on the `user` frame.
 */

import {
  parseResumeCursor,
  type ResumableStreamSource,
  serveResumableStream,
} from "@houston/runtime-client";
import { channel, chatKey } from "./chat-channel";
import { streamReplySafe } from "./chat-turn";
import { noContent } from "./http";
import { type SseSink, sseResponse } from "./sse";

/** `GET /agents/:id/conversations/:cid/events` — subscribe to the turn stream. */
export function openChatStream(
  req: Request,
  agentId: string,
  cid: string,
): Response {
  const ch = channel(chatKey(agentId, cid));
  const after = parseResumeCursor(
    new URL(req.url).searchParams.get("after"),
    req.headers.get("last-event-id") ?? undefined,
  );
  const source: ResumableStreamSource = {
    subscribe: (deliver) => {
      ch.subscribers.add(deliver);
      return () => ch.subscribers.delete(deliver);
    },
    snapshot: () => ch.channel.snapshot,
    replayAfter: (a) => ch.channel.replayAfter(a),
  };
  return sseResponse(req, (sink: SseSink) => {
    sink.comment("connected");
    ch.sinks.add(sink);
    sink.onClose(() => ch.sinks.delete(sink));
    serveResumableStream(source, after, (frame) => sink.frame(frame)).then(
      (unsubscribe) => sink.onClose(unsubscribe),
      (err: unknown) => {
        console.error("[fake-host] chat stream stitch failed:", err);
        queueMicrotask(() => {
          throw err;
        });
      },
    );
  });
}

/**
 * `POST /agents/:id/conversations/:cid/messages` — fire the turn (202). The
 * turn produces into the replay log whether or not a stream is attached, just
 * like the real runtime. The nonce is echoed on the `user` frame.
 */
export function sendMessage(
  agentId: string,
  cid: string,
  text: string,
  nonce: string | undefined,
): Response {
  streamReplySafe(agentId, cid, text, nonce);
  return noContent(202);
}
