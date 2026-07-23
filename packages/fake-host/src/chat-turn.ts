/**
 * The fake host's turn/reply producer — resumable, sequenced, and turn-stamped,
 * modelling the real runtime's turn lifecycle:
 *
 * - A turn produces into the replay log whether or not a stream is attached;
 *   every turn-scoped frame carries the turn's `turnId`, and the `user` echo
 *   carries the sender's nonce — the identity contract the client's turn sink
 *   matches against.
 * - History persists the user message at turn start + the assistant reply at
 *   turn end (both with `turnId`), like the real runtime.
 * - `terminate` synthesizes the terminal `error` frame the runtime reaper /
 *   cancel path emits; `cancelChat` is the user-abort surface.
 *
 * The `replyDelayMs` knob paces the deltas; the reconnect e2e slows it to drop
 * mid-turn. Test controls that drive these primitives live in chat-controls.ts.
 */

import type { PendingInteraction } from "@houston/protocol";
import { type ChatChannel, channel, chatKey, publish } from "./chat-channel";
import * as state from "./state";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The host reaper's dead-turn copy (host `turn/relay-dialect.ts`). */
export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

/** Per-delta streaming delay; the reconnect e2e slows it to drop mid-turn. */
const DEFAULT_REPLY_DELAY_MS = 15;
let replyDelayMs = DEFAULT_REPLY_DELAY_MS;

export function setReplyDelay(ms: number): void {
  replyDelayMs = ms;
}

/**
 * Arm the NEXT scripted turn to end on a pending interaction — its `done` frame
 * carries it, so the client settles the card to `needs_you` and drives the
 * composer-replacing question/connect card (element 4's e2e). One-shot:
 * consumed when that turn finishes. `null` disarms.
 */
let nextInteraction: PendingInteraction | null = null;
export function setNextInteraction(pi: PendingInteraction | null): void {
  nextInteraction = pi;
}

/** Reset the per-delta delay + armed interaction (test reset). */
export function resetReplyDelay(): void {
  replyDelayMs = DEFAULT_REPLY_DELAY_MS;
  nextInteraction = null;
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
  displayText: string | undefined,
): Promise<void> {
  const ch = channel(chatKey(agentId, cid));
  const epoch = ch.epoch;
  const turnId = crypto.randomUUID();
  const reply = cannedReply(userText);
  ch.pending = { turnId, remaining: replyDeltas(reply) };
  // The user message persists at turn START (the dead-turn history shape).
  state.appendUserMessage(agentId, cid, userText, turnId, displayText);
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
  // Consume any armed interaction: this turn's `done` carries it (one-shot).
  const interaction = nextInteraction;
  nextInteraction = null;
  finishTurn(agentId, cid, ch, turnId, reply, interaction);
}

/** Publish the turn's usage + done and persist the assistant reply. The `done`
 *  frame carries `pendingInteraction` when the turn ended asking the user. */
export function finishTurn(
  agentId: string,
  cid: string,
  ch: ChatChannel,
  turnId: string,
  reply: string,
  pendingInteraction: PendingInteraction | null = null,
): void {
  publish(ch, { type: "usage", data: state.seedUsage, turnId });
  publish(ch, {
    type: "done",
    data: null,
    turnId,
    ...(pendingInteraction ? { pendingInteraction } : {}),
  });
  state.appendAssistantMessage(agentId, cid, reply, turnId, pendingInteraction);
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
  displayText?: string,
): void {
  streamReply(agentId, cid, text, nonce, displayText).catch((err: unknown) => {
    console.error("[fake-host] streamReply failed:", err);
    queueMicrotask(() => {
      throw err;
    });
  });
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
