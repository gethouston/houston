import {
  type HeartbeatDoc,
  type HeartbeatTurnEnd,
  loadHeartbeatDoc,
  settleHeartbeatRun,
} from "@houston/domain";
import { type ChatMessage, isCompactionSummary } from "@houston/protocol";
import type { Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import { conversationKey, type WorkspacePaths } from "../paths";
import type { ChannelCtx, RuntimeChannel } from "../ports";
import { ASSISTANT_CONVERSATION_ID } from "../routes/assistant";
import type { FireLock } from "../schedule/fire-lock";
import { providerErrorSummary } from "../schedule/run-failure";
import type { Vfs } from "../vfs";

export interface SettleDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  channel: RuntimeChannel;
  lock: FireLock;
  events?: EventHub;
}

interface StoredFile {
  messages?: ChatMessage[];
  archived?: { segments?: number[] };
}

/**
 * The briefing turn's messages, found by the nonce it was sent with: the user
 * message carries it and the replies carry its `turnId`. Read from the live
 * transcript, else from its archive segments newest first (the runtime never
 * splits a turn across files, conversation-archive.ts), stopping at a segment
 * that ends before the briefing started. Null when the turn is nowhere.
 */
export async function readBriefingTurn(
  read: (key: string) => Promise<string | null>,
  liveKey: string,
  nonce: string,
  sinceMs: number,
): Promise<ChatMessage[] | null> {
  const parse = async (key: string): Promise<StoredFile> => {
    const raw = await read(key);
    return raw ? (JSON.parse(raw) as StoredFile) : {};
  };
  const live = await parse(liveKey);
  const found = turnIn(live.messages ?? [], nonce);
  if (found) return found;
  const segments = live.archived?.segments ?? [];
  const archiveDir = liveKey.replace(/\.json$/, ".archive");
  for (let n = segments.length; n >= 1; n--) {
    const messages = (await parse(`${archiveDir}/${n}.json`)).messages ?? [];
    const turn = turnIn(messages, nonce);
    if (turn) return turn;
    if ((messages.at(-1)?.ts ?? 0) < sinceMs) return null;
  }
  return null;
}

function turnIn(
  messages: readonly ChatMessage[],
  nonce: string,
): ChatMessage[] | null {
  const at = messages.findIndex((m) => m.role === "user" && m.nonce === nonce);
  const prompt = messages[at];
  if (!prompt) return null;
  const after = messages.slice(at + 1);
  if (prompt.turnId) return after.filter((m) => m.turnId === prompt.turnId);
  const next = after.findIndex((m) => m.role === "user");
  return next === -1 ? after : after.slice(0, next);
}

/**
 * How a finished turn ended, from the outcome the runtime persisted on its
 * replies: a provider error, a stop, an engine-restart interruption, or no
 * words at all is a failed briefing; otherwise it was delivered.
 */
export function briefingOutcome(
  turn: readonly ChatMessage[] | null,
): { kind: "completed" } | { kind: "failed"; reason: string } {
  if (!turn)
    return { kind: "failed", reason: "the briefing never reached the chat" };
  const replies = turn.filter((m) => m.role === "assistant");
  const failed = replies.find((m) => m.providerError)?.providerError;
  if (failed) return { kind: "failed", reason: providerErrorSummary(failed) };
  if (replies.some((m) => m.stopped))
    return { kind: "failed", reason: "the briefing turn was stopped" };
  if (replies.some((m) => m.interrupted))
    return { kind: "failed", reason: "the briefing turn was interrupted" };
  if (
    !turn.some(
      (m, i) =>
        m.role === "assistant" &&
        m.content.trim() &&
        !isCompactionSummary(m, turn[i + 1]),
    )
  )
    return {
      kind: "failed",
      reason: "the briefing turn ended without a reply",
    };
  return { kind: "completed" };
}

/**
 * Settle an admitted briefing once its turn is over: `seen` moves and the
 * person is told only for a turn that finished with a reply. Nothing is read
 * while the manager is busy (the turn, or the person's next one, is still
 * running). Returns the document as it now stands.
 */
export async function settlePendingBriefing(
  deps: SettleDeps,
  ws: Workspace,
  ctx: ChannelCtx,
  doc: HeartbeatDoc,
  now: Date,
): Promise<HeartbeatDoc> {
  const { pending } = doc;
  if (!pending || (await deps.channel.busy(ctx))) return doc;
  const liveKey = conversationKey(
    deps.paths,
    ctx.workspace,
    ctx.agent,
    ASSISTANT_CONVERSATION_ID,
  );
  const outcome = briefingOutcome(
    await readBriefingTurn(
      (key) => deps.vfs.readText(key),
      liveKey,
      pending.nonce,
      Date.parse(pending.at),
    ),
  );
  const at = now.toISOString();
  const { nonce } = pending;
  const end: HeartbeatTurnEnd =
    outcome.kind === "completed"
      ? { kind: "completed", nonce, at }
      : { kind: "failed", nonce, at, reason: outcome.reason };
  const settled = await settleHeartbeatRun(deps.vfs, ws.id, end);
  // Settled elsewhere first (it told the person), or a newer briefing
  // replaced this one: the outcome read is not this document's to apply.
  if (!settled) return loadHeartbeatDoc(deps.vfs, ws.id);
  const first = await deps.lock.setNx(
    `heartbeat:settled:${ws.id}:${pending.nonce}`,
    "1",
    2 * 86_400,
  );
  deps.events?.emit(ws.ownerUserId, {
    type: "HeartbeatChanged",
    workspaceId: ws.id,
  });
  if (first && outcome.kind === "completed")
    deps.events?.emit(ws.ownerUserId, {
      type: "HeartbeatDelivered",
      agentPath: ctx.agent.id,
      date: settled.last?.date ?? at.slice(0, 10),
    });
  return settled;
}
