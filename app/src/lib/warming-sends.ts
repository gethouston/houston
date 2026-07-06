/**
 * The warming-engine send queue (HOU-693).
 *
 * A message sent while the agent's engine is still warming up must NOT go out
 * as a held wire request: infrastructure timeouts kill held connections, and
 * a reload aborts them — either way the message silently dies. Instead the
 * message renders as a local bubble immediately, is persisted with the
 * agent's provisioning entry, and the real send fires the moment the
 * readiness probe clears (`flushWarmingSends`), with `suppressUserBubble` so
 * the bubble is never doubled.
 *
 * Attachment prompts are built by a closure (the files can't persist): after
 * a relaunch the flush falls back to the message text alone.
 */

import { pushPendingUserMessage } from "@houston-ai/engine-client";
import { getConversationFeed } from "../hooks/use-conversation-vm";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning";
import { getEngine } from "./engine";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { logger } from "./logger";
import { tauriActivity, tauriChat } from "./tauri";

/** Prompt builders keyed by send id — in-memory only, lost on reload. */
const promptBuilders = new Map<string, () => Promise<string> | string>();

/** Entries whose flush has started: too late to queue — send normally. */
const flushing = new WeakSet<ProvisioningEntry>();

export function isFlushingWarmingSends(entry: ProvisioningEntry): boolean {
  return flushing.has(entry);
}

export interface QueueWarmingSendArgs {
  agentPath: string;
  sessionKey: string;
  /** What the user typed — bubble + fallback prompt. */
  text: string;
  /** Builds the real wire prompt (attachment refs). Optional. */
  buildPrompt?: () => Promise<string> | string;
  /** Board row for a NEW conversation's first message (created at flush). */
  row?: PendingWarmingSend["row"];
  promptFile?: string;
  provider?: string;
  model?: string;
  effort?: string;
}

/**
 * Render the bubble and hand the send to the provisioning entry. The caller
 * (the store) owns entry mutation + persistence; this builds the record and
 * parks the prompt builder.
 */
export function buildWarmingSend(
  args: QueueWarmingSendArgs,
): PendingWarmingSend {
  pushPendingUserMessage(args.agentPath, args.sessionKey, args.text);
  const send: PendingWarmingSend = {
    id: crypto.randomUUID(),
    sessionKey: args.sessionKey,
    text: args.text,
    row: args.row,
    promptFile: args.promptFile,
    provider: args.provider,
    model: args.model,
    effort: args.effort,
  };
  if (args.buildPrompt) promptBuilders.set(send.id, args.buildPrompt);
  return send;
}

/**
 * After a relaunch mid-warm-up: the VM is empty, so re-render the queued
 * bubbles. Only when the conversation truly has nothing — a live VM already
 * shows them.
 */
export function restoreWarmingBubbles(entry: ProvisioningEntry): void {
  for (const send of entry.pendingSends ?? []) {
    if (getConversationFeed(entry.agentPath, send.sessionKey).length === 0) {
      pushPendingUserMessage(entry.agentPath, send.sessionKey, send.text);
    }
  }
}

/**
 * The engine answered: fire the queued sends, in order. Each send resolves as
 * soon as its turn stream is registered (the adapter holds follow-ups behind
 * a running turn on its own). A failed send surfaces via the tauri wrapper's
 * toast; the remaining sends still go out. Index-drained so a message queued
 * mid-flush (the entry is live until the caller clears it) is delivered too;
 * once the flush starts, `isFlushingWarmingSends` steers new sends to the
 * normal wire path instead.
 */
export async function flushWarmingSends(
  entry: ProvisioningEntry,
): Promise<void> {
  flushing.add(entry);
  for (let i = 0; ; i++) {
    const send = entry.pendingSends?.[i];
    if (!send) break;
    const build = promptBuilders.get(send.id);
    promptBuilders.delete(send.id);
    let prompt = send.text;
    if (build) {
      try {
        prompt = await build();
      } catch (e) {
        // The attachment save failed (already toasted by its own wrapper) —
        // deliver the words rather than dropping the message with the files.
        logger.error(`[warming-sends] prompt build failed: ${e}`);
      }
    }
    // The conversation's board row lands here, not at send time: the engine
    // is awake now, and the id-upsert makes a retry of an already-landed row
    // a no-op. A failure loses only the card — the message still delivers.
    if (send.row) {
      try {
        const created = await tauriActivity.createWithId(
          entry.agentPath,
          send.row,
        );
        if (created.id !== send.row.id) {
          // Version skew: an engine that predates client-supplied ids
          // (HOU-693) assigned its own. Stamp our session key on its row so
          // the board card still opens THIS conversation and the turn's
          // status writes still resolve (both match session_key first).
          await getEngine().updateActivity(entry.agentPath, created.id, {
            session_key: send.sessionKey,
          });
        }
      } catch {
        showErrorToast(
          "warming_sends_row",
          i18n.t("chat:errors.missionRowFailed"),
        );
      }
    }
    // The bubble is already on screen (pushed at queue time, or restored on
    // rehydrate) — never double it. If the scope is somehow empty (renamed
    // agent moved the VM scope), let the turn push it.
    const suppress = getConversationFeed(entry.agentPath, send.sessionKey).some(
      (f) => f.feed_type === "user_message",
    );
    try {
      await tauriChat.send(entry.agentPath, prompt, send.sessionKey, {
        mode: send.promptFile,
        providerOverride: send.provider,
        modelOverride: send.model,
        effortOverride: send.effort,
        suppressUserBubble: suppress,
      });
    } catch (e) {
      // tauriChat.send already toasted the real reason; keep flushing the
      // rest — one refused turn must not strand the queue.
      logger.error(`[warming-sends] deferred send failed: ${e}`);
    }
  }
}
