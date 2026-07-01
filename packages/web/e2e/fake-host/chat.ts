/**
 * The fake host's chat-stream engine.
 *
 * The new engine streams a turn over SSE: the client subscribes to the
 * conversation's `events` stream FIRST, then POSTs the message (fire-and-forget
 * 202). We register the open stream, then push a canned reply (`text` deltas →
 * `usage` → `done`) when the message lands — exactly like the real runtime
 * (packages/runtime-client + engine-adapter/translate.ts).
 */
import type { WireEvent } from "@houston/runtime-client";
import { noContent } from "./http";
import { type SseSink, sseResponse } from "./sse";
import * as state from "./state";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Open chat streams, keyed `${agentId}:${conversationId}`. */
const chatSinks = new Map<string, SseSink>();
/** A send that raced ahead of its subscribe — flushed when the stream opens. */
const pendingSends = new Map<string, string>();

function chatKey(agentId: string, cid: string): string {
  return `${agentId}:${cid}`;
}

async function streamReply(
  agentId: string,
  cid: string,
  userText: string,
  sink: SseSink,
): Promise<void> {
  const reply = `Roger that. You said: "${userText}"`;
  // Three deltas so the UI exercises accumulation, not a single blob.
  const third = Math.ceil(reply.length / 3);
  const deltas = [
    reply.slice(0, third),
    reply.slice(third, third * 2),
    reply.slice(third * 2),
  ];
  for (const data of deltas) {
    if (sink.closed) return;
    sink.push({ type: "text", data } satisfies WireEvent);
    await delay(15);
  }
  if (sink.closed) return;
  sink.push({ type: "usage", data: state.seedUsage } satisfies WireEvent);
  sink.push({ type: "done", data: null } satisfies WireEvent);
  state.appendTurn(agentId, cid, userText, reply);
}

/** `GET /agents/:id/conversations/:cid/events` — subscribe to the turn stream. */
export function openChatStream(
  req: Request,
  agentId: string,
  cid: string,
): Response {
  const key = chatKey(agentId, cid);
  return sseResponse(req, (sink) => {
    sink.comment("connected");
    // First frame on connect: no turn running yet (translate ignores an empty sync).
    sink.push({
      type: "sync",
      data: { running: false, partial: "" },
    } satisfies WireEvent);
    chatSinks.set(key, sink);
    const pending = pendingSends.get(key);
    if (pending !== undefined) {
      pendingSends.delete(key);
      void streamReply(agentId, cid, pending, sink);
    }
  });
}

/** `POST /agents/:id/conversations/:cid/messages` — fire the turn (202). */
export function sendMessage(
  agentId: string,
  cid: string,
  text: string,
): Response {
  const key = chatKey(agentId, cid);
  const sink = chatSinks.get(key);
  if (sink && !sink.closed) void streamReply(agentId, cid, text, sink);
  else pendingSends.set(key, text); // subscribe hasn't landed yet — flush on open
  return noContent(202);
}

/** Close the stream for a cancelled conversation. */
export function cancelChat(agentId: string, cid: string): void {
  chatSinks.get(chatKey(agentId, cid))?.close();
}

/** Drop any chat streams still registered (called on reset between tests). */
export function clearChatStreams(): void {
  for (const sink of chatSinks.values()) sink.close();
  chatSinks.clear();
  pendingSends.clear();
}
