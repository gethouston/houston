import type {
  ChatMessage,
  PendingInteraction,
  ToolCallRecord,
} from "@houston/protocol";
import { type ChatChannel, channel, chatKey, publish } from "./chat-channel";
import { resetHold, takeHold, waitForRelease } from "./chat-hold";
import {
  cannedReply,
  replyDeltas,
  resetScript,
  takeInteraction,
} from "./chat-script";
import { streamToolCalls, takeToolCalls, toolRecords } from "./chat-tools";
import * as state from "./state";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

const DEFAULT_REPLY_DELAY_MS = 15;
let replyDelayMs = DEFAULT_REPLY_DELAY_MS;

export function setReplyDelay(ms: number): void {
  replyDelayMs = ms;
}

export function resetReplyDelay(): void {
  replyDelayMs = DEFAULT_REPLY_DELAY_MS;
  resetScript();
  resetHold();
}

async function streamReply(
  agentId: string,
  cid: string,
  turnId: string,
  userText: string,
  nonce: string | undefined,
  displayText: string | undefined,
  mentions: ChatMessage["mentions"],
): Promise<void> {
  const ch = channel(chatKey(agentId, cid));
  const epoch = ch.epoch;
  const reply = cannedReply(userText);
  const tools = takeToolCalls();
  const held = takeHold();
  let sent = 0;
  ch.pending = { turnId, remaining: replyDeltas(reply) };
  state.appendUserMessage(
    agentId,
    cid,
    userText,
    turnId,
    displayText,
    mentions,
  );
  publish(ch, {
    type: "user",
    data: {
      content: userText,
      ts: Date.now(),
      nonce,
      ...(mentions ? { mentions } : {}),
    },
    turnId,
  });
  await streamToolCalls(
    ch,
    turnId,
    tools,
    () => delay(replyDelayMs),
    () => ch.epoch === epoch && ch.pending?.turnId === turnId,
  );
  for (;;) {
    if (ch.epoch !== epoch || ch.pending?.turnId !== turnId) return;
    const next = ch.pending.remaining.shift();
    if (next === undefined) break;
    publish(ch, { type: "text", data: next, turnId });
    await (held && sent++ === 0 ? waitForRelease() : delay(replyDelayMs));
  }
  if (ch.epoch !== epoch || ch.pending?.turnId !== turnId) return;
  const interaction = takeInteraction();
  finishTurn(agentId, cid, ch, turnId, reply, interaction, toolRecords(tools));
}

export function finishTurn(
  agentId: string,
  cid: string,
  ch: ChatChannel,
  turnId: string,
  reply: string,
  pendingInteraction: PendingInteraction | null = null,
  tools: ToolCallRecord[] = [],
): void {
  publish(ch, { type: "usage", data: state.seedUsage, turnId });
  publish(ch, {
    type: "done",
    data: null,
    turnId,
    ...(pendingInteraction ? { pendingInteraction } : {}),
  });
  state.appendAssistantMessage(
    agentId,
    cid,
    reply,
    turnId,
    pendingInteraction,
    tools,
  );
  ch.pending = null;
}

export function streamReplySafe(
  agentId: string,
  cid: string,
  text: string,
  nonce: string | undefined,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
): string {
  const turnId = crypto.randomUUID();
  streamReply(agentId, cid, turnId, text, nonce, displayText, mentions).catch(
    (err: unknown) => {
      console.error("[fake-host] streamReply failed:", err);
      queueMicrotask(() => {
        throw err;
      });
    },
  );
  return turnId;
}

export function terminate(ch: ChatChannel, message: string): boolean {
  const snap = ch.channel.snapshot;
  if (!snap.running) return false;
  ch.epoch++;
  ch.pending = null;
  publish(ch, {
    type: "error",
    data: { message },
    ...(snap.turnId ? { turnId: snap.turnId } : {}),
  });
  return true;
}

export function cancelChat(agentId: string, cid: string): boolean {
  return terminate(channel(chatKey(agentId, cid)), "Stopped by user");
}
