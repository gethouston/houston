import type { ChatMessage } from "@houston/protocol";
import {
  parseResumeCursor,
  type ResumableStreamSource,
  serveResumableStream,
} from "@houston/runtime-client";
import { channel, chatKey } from "./chat-channel";
import { streamReplySafe } from "./chat-turn";
import { json } from "./http";
import { type SseSink, sseResponse } from "./sse";

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

export function sendMessage(
  agentId: string,
  cid: string,
  text: string,
  nonce: string | undefined,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
): Response {
  const turnId = streamReplySafe(
    agentId,
    cid,
    text,
    nonce,
    displayText,
    mentions,
  );
  return json({ ok: true, id: cid, turnId }, 202);
}
