/**
 * The fake host's chat-stream engine — resumable, sequenced, and turn-stamped,
 * built from the SAME shared pieces as the real servers (runtime
 * `transport/events-route.ts`, host `turn/events-route.ts`):
 *
 * - `StreamChannel` owns each conversation's publish ordering (append →
 *   reduce → fan out → clear-on-terminal); every turn-scoped frame carries the
 *   turn's `turnId`, and the `user` echo carries the sender's nonce — exactly
 *   the identity contract the client's turn sink matches against.
 * - `serveResumableStream` serves each connection: fresh connect → `sync`;
 *   `?after=<seq>` / `Last-Event-ID` → gap/dupe-free replay; unserviceable
 *   cursor → `sync` with `resync: true`.
 * - Turns run regardless of subscribers, and history persists the user message
 *   at turn start + the assistant reply at turn end (both with `turnId`), like
 *   the real runtime.
 *
 * Test controls: `dropChatStreams` severs open streams WITHOUT ending the
 * turns (network drop); `killRunningTurns` synthesizes the dead-pump reaper's
 * terminal error; `turnBoundary` ends the running turn while nobody watches
 * and starts the NEXT one (the resync-across-a-turn-boundary e2e).
 */
import {
  parseResumeCursor,
  type ResumableStreamSource,
  type SequencedFrame,
  StreamChannel,
  serveResumableStream,
  type WireFrame,
} from "@houston/runtime-client";
import { noContent } from "./http";
import { type SseSink, sseResponse } from "./sse";
import * as state from "./state";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The host reaper's dead-turn copy (host `turn/relay-dialect.ts`). */
export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

export interface PendingTurn {
  turnId: string;
  /** Reply deltas the producer loop has not published yet. */
  remaining: string[];
}

export interface ChatChannel {
  /** Shared publish core: seq authority + replay buffer + snapshot. */
  channel: StreamChannel;
  /** Live per-connection delivery callbacks (serveResumableStream). */
  subscribers: Set<(frame: SequencedFrame) => void>;
  /** Open SSE connections, so test controls can sever them. */
  sinks: Set<SseSink>;
  /** Bumped on cancel/kill/boundary/reset so an in-flight producer stops. */
  epoch: number;
  /** The running turn, while its producer loop is live. */
  pending: PendingTurn | null;
}

/** Chat channels, keyed `${agentId}:${conversationId}`. */
export const channels = new Map<string, ChatChannel>();
/** Per-delta streaming delay; the reconnect e2e slows it to drop mid-turn. */
const DEFAULT_REPLY_DELAY_MS = 15;
let replyDelayMs = DEFAULT_REPLY_DELAY_MS;

export function setReplyDelay(ms: number): void {
  replyDelayMs = ms;
}

function chatKey(agentId: string, cid: string): string {
  return `${agentId}:${cid}`;
}

function channel(key: string): ChatChannel {
  let ch = channels.get(key);
  if (!ch) {
    ch = {
      channel: new StreamChannel(),
      subscribers: new Set(),
      sinks: new Set(),
      epoch: 0,
      pending: null,
    };
    channels.set(key, ch);
  }
  return ch;
}

/** Publish one event through the shared channel, fanning out to live streams. */
export function publish(ch: ChatChannel, event: WireFrame): void {
  ch.channel.publish(event, (frame) => {
    for (const deliver of ch.subscribers) deliver(frame);
  });
}

function cannedReply(userText: string): string {
  return `Roger that. You said: "${userText}"`;
}

/** Three deltas so the UI exercises accumulation, not a single blob. */
function replyDeltas(reply: string): string[] {
  const third = Math.ceil(reply.length / 3);
  return [
    reply.slice(0, third),
    reply.slice(third, third * 2),
    reply.slice(third * 2),
  ];
}

async function streamReply(
  agentId: string,
  cid: string,
  userText: string,
  nonce: string | undefined,
): Promise<void> {
  const ch = channel(chatKey(agentId, cid));
  const epoch = ch.epoch;
  const turnId = crypto.randomUUID();
  const reply = cannedReply(userText);
  ch.pending = { turnId, remaining: replyDeltas(reply) };
  // The user message persists at turn START (the dead-turn history shape).
  state.appendUserMessage(agentId, cid, userText, turnId);
  publish(ch, {
    type: "user",
    data: { content: userText, ts: Date.now(), nonce },
    turnId,
  });
  for (;;) {
    if (ch.epoch !== epoch || ch.pending?.turnId !== turnId) return;
    const next = ch.pending.remaining.shift();
    if (next === undefined) break;
    publish(ch, { type: "text", data: next, turnId });
    await delay(replyDelayMs);
  }
  if (ch.epoch !== epoch || ch.pending?.turnId !== turnId) return;
  finishTurn(agentId, cid, ch, turnId, reply);
}

/** Publish the turn's usage + done and persist the assistant reply. */
export function finishTurn(
  agentId: string,
  cid: string,
  ch: ChatChannel,
  turnId: string,
  reply: string,
): void {
  publish(ch, { type: "usage", data: state.seedUsage, turnId });
  publish(ch, { type: "done", data: null, turnId });
  state.appendAssistantMessage(agentId, cid, reply, turnId);
  ch.pending = null;
}

/**
 * Fire-and-forget a canned turn, crashing the harness LOUDLY if it ever
 * fails — a swallowed fake-host bug would surface as a hanging test instead.
 */
export function streamReplySafe(
  agentId: string,
  cid: string,
  text: string,
  nonce: string | undefined,
): void {
  streamReply(agentId, cid, text, nonce).catch((err: unknown) => {
    console.error("[fake-host] streamReply failed:", err);
    queueMicrotask(() => {
      throw err;
    });
  });
}

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
  return sseResponse(req, (sink) => {
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

/** Terminate a channel's running turn with a terminal `error` frame. */
export function terminate(ch: ChatChannel, message: string): boolean {
  const snap = ch.channel.snapshot;
  if (!snap.running) return false;
  ch.epoch++;
  ch.pending = null;
  publish(ch, {
    type: "error",
    data: { message },
    // The dead turn's id — exactly what the host reaper stamps.
    ...(snap.turnId ? { turnId: snap.turnId } : {}),
  });
  return true;
}

/**
 * Abort an in-flight turn the way the runtime does: a "Stopped by user" error
 * frame is the terminal surface. Returns whether a turn was actually live
 * (the route reports it as `cancelled`).
 */
export function cancelChat(agentId: string, cid: string): boolean {
  return terminate(channel(chatKey(agentId, cid)), "Stopped by user");
}

/** Reset the per-delta delay (test reset). Controls live in chat-controls.ts. */
export function resetReplyDelay(): void {
  replyDelayMs = DEFAULT_REPLY_DELAY_MS;
}
