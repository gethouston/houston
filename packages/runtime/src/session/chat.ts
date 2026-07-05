import { rmSync } from "node:fs";
import { join } from "node:path";
import { activeProvider, resolveModel } from "../ai/providers";
import { syncServedCredential } from "../auth/serve";
import { cleanupClaudeConversation } from "../backends/claude/cleanup";
import { config } from "../config";
import type { ActingContext } from "./acting-context";
import { publish } from "./bus";
import {
  type Conversation,
  conversations,
  getConversation,
} from "./conversation-cache";
import { execTurn, type TurnPin } from "./exec-turn";
import { withWorkdirLock } from "./workdir-lock";

/**
 * The runtime's public turn API: start (queued per conversation), cancel,
 * dispose. Fire-and-forget from the caller's view — events are delivered over
 * the conversation's event bus (`GET /conversations/:id/events`), NOT on the
 * request that triggered the turn. The session cache lives in
 * conversation-cache.ts; the turn executor in exec-turn.ts; the compaction
 * decision in provider-switch.ts.
 */

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Sync the workspace's central credential, then report the connected provider (or
 * null). The message route AWAITS this before accepting a turn, so a logged-out /
 * never-connected turn fails the REQUEST — the client surfaces the error at once —
 * instead of starting a fire-and-forget turn whose only failure signal is an
 * `error` event that can race the client's SSE subscribe and get lost, leaving the
 * chat spinning forever after logout.
 */
export async function ensureProviderForTurn(): Promise<string | null> {
  // Connect-once: pull the workspace's current central credential into auth.json
  // so pi uses the user's own token. Best-effort — a transient failure leaves the
  // existing (still-valid) credential; a forgotten connection => activeProvider null.
  try {
    await syncServedCredential();
  } catch (err) {
    console.error("[serve] credential sync failed:", errMessage(err));
  }
  const provider = activeProvider();
  // Ground-truth diagnostic: the provider + model + the model's actual API base
  // URL this turn will run against. baseUrl is unambiguous — opencode.ai/zen/go/v1
  // is OpenCode Go, openai/chatgpt is Codex — unlike asking the model itself,
  // which open models (GLM/Kimi/…) routinely get wrong.
  if (provider) {
    try {
      const m = resolveModel() as { id?: string; baseUrl?: string };
      console.log(
        `[turn] provider=${provider} model=${m.id} baseUrl=${m.baseUrl}`,
      );
    } catch {
      /* resolveModel can throw on a bad pin; the turn surfaces it as an error */
    }
  }
  return provider;
}

/**
 * Start a turn for a conversation. Turns on the same conversation are
 * serialized (ordered resume). Never rejects — failures surface as `error`
 * events on the conversation's stream.
 */
export async function runTurn(
  id: string,
  text: string,
  nonce?: string,
  pin?: TurnPin,
  acting?: ActingContext,
): Promise<void> {
  // Mint the turn's wire identity up front so even a turn that fails before
  // executing (the guards below) terminates under one id.
  const turnId = crypto.randomUUID();
  // The message route already synced the credential and confirmed a provider via
  // ensureProviderForTurn. Re-check here as a cheap guard for the narrow window
  // where the provider is logged out mid-turn: getConversation returns a CACHED
  // session without re-running resolveModel()'s connect guard, so without this a
  // now-credential-less turn could still reach session.prompt() and hang with no
  // terminal event. A provider-pinned turn (a routine) skips the guard — its
  // pin is never auth-gated; a failure surfaces as the turn's provider error.
  if (!pin?.provider && !activeProvider()) {
    publish(id, {
      type: "error",
      data: { message: "No provider connected. Connect an AI provider first." },
      turnId,
    });
    return;
  }

  let conv: Conversation;
  try {
    conv = await getConversation(id, pin);
  } catch (err) {
    // e.g. no provider connected — surface it on the conversation's stream.
    publish(id, { type: "error", data: { message: errMessage(err) }, turnId });
    return;
  }

  // Two layers of serialization: per-conversation ordering (conv.queue) AND
  // the per-workdir lock — every conversation in this runtime shares ONE
  // workspaceDir, so a routine's turn and a user chat queue instead of
  // mutating the same files concurrently (the Rust engine's workdir_locks
  // behavior). The conv.queue link resolves before the lock is requested, so
  // the two layers can't deadlock.
  const run = conv.queue.then(() =>
    withWorkdirLock(config.workspaceDir, () =>
      execTurn(conv, id, turnId, text, nonce, pin, acting),
    ),
  );
  // Keep the queue chain alive past a turn. execTurn already surfaces its own
  // failure as an `error` event, so this guard never swallows a user-visible one.
  conv.queue = run.catch(() => {});
  await run;
}

/**
 * Abort the in-flight turn for a conversation. Returns whether a live turn was
 * actually aborted: `false` means nothing was in flight — the conversation isn't
 * cached (e.g. the runtime restarted), so there is no turn to stop and no
 * terminal event will follow. The caller uses this to settle a card that's stuck
 * "running" because its owning turn died without ever settling it.
 */
export async function cancelTurn(id: string): Promise<boolean> {
  const conv = conversations.get(id);
  if (!conv) return false;
  // Surface a clear stop confirmation in the chat. Published BEFORE the abort so
  // it settles the turn first; pi's own abort rejection (if any) then arrives at
  // the already-settled stream and is ignored, so the user sees this one friendly
  // message instead of a raw abort error. STOPPED_BY_USER is matched verbatim by
  // the web adapter to render it as a neutral "you stopped it", not a failure.
  // Stamped with the EXECUTING turn's id (absent when the stop raced turn end)
  // so the stop terminates exactly the turn the user watched.
  publish(id, {
    type: "error",
    data: { message: STOPPED_BY_USER },
    turnId: conv.turnId,
  });
  await conv.session.abort();
  return true;
}

/**
 * The verbatim message a user-initiated stop surfaces. The control plane's relay
 * emits the same string on abort, and the web adapter matches it (isStoppedByUser)
 * to settle the chat as an intentional stop — back to the user, never a red error.
 */
export const STOPPED_BY_USER = "Stopped by user";

/**
 * Drop a conversation's live session (aborting any in-flight turn) and, when
 * requested, its on-disk session history. Used by DELETE /conversations/:id.
 *
 * Two backends store history in two places, so deletion clears both: pi's
 * per-conversation transcript dir (`<dataDir>/sessions/<id>`), and the Claude
 * Agent SDK backend's `sessions.json` mapping + transcript JSONL. The Claude
 * cleanup is called unconditionally — it is a no-op for a conversation that never
 * ran on the anthropic backend — so a deleted anthropic chat leaves no SDK state
 * behind without chat.ts needing to know which provider the conversation used.
 */
export async function disposeConversation(
  id: string,
  opts?: { deleteSessions?: boolean },
): Promise<void> {
  const conv = conversations.get(id);
  if (conv) {
    conversations.delete(id);
    await conv.session.abort();
    conv.session.dispose();
  }
  if (opts?.deleteSessions) {
    rmSync(join(config.dataDir, "sessions", id), {
      recursive: true,
      force: true,
    });
    cleanupClaudeConversation(config.dataDir, id);
  }
}
