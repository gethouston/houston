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
 * The flush lands each send's board row first (`warming-send-row.ts`).
 * Which prompt the flush puts on the wire — the live builder's, the one
 * resolved at queue time, or the user's own words — is `warming-send-prompt.ts`.
 */

import { pushPendingUserMessage } from "@houston/engine-adapter";
import { getConversationFeed } from "../hooks/use-conversation-vm";
import { actingUser } from "./acting-user";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning/entry";
import { reportError } from "./error-report";
import { logger } from "./logger";
import {
  chooseWarmingPrompt,
  undeliverableSend,
  type WarmingSendInput,
  warmingSendRecord,
} from "./warming-send-prompt";
import { landWarmingRow, settleWarmingRow } from "./warming-send-row";
import { wireWarmingSend } from "./warming-send-wire";

/** Prompt builders keyed by send id — in-memory only, lost on reload. */
const promptBuilders = new Map<string, () => Promise<string> | string>();

/** Entries whose flush has started: too late to queue — send normally. */
const flushing = new WeakSet<ProvisioningEntry>();

export function isFlushingWarmingSends(entry: ProvisioningEntry): boolean {
  return flushing.has(entry);
}

export interface QueueWarmingSendArgs extends WarmingSendInput {
  agentPath: string;
  /**
   * Builds the wire prompt at FLUSH time, because building it writes the
   * attachments through an engine that is still coming up. A closure, so it
   * is lost on a relaunch: a caller whose prompt is already knowable passes
   * `prompt` instead, which the mirror carries (`warming-send-prompt.ts`).
   */
  buildPrompt?: () => Promise<string> | string;
}

/**
 * Render the bubble and hand the send to the provisioning entry. The caller
 * (the store) owns entry mutation + persistence; this builds the record and
 * parks the prompt builder.
 */
export function buildWarmingSend(
  args: QueueWarmingSendArgs,
): PendingWarmingSend {
  // A row-only entry carries no user message — nothing to render. Neither does
  // a Houston-started conversation (empty `text`, the whole message hidden in
  // the prompt): an empty bubble is not a message.
  if (!args.rowOnly && args.text.length > 0) {
    // Stamp the sender (HOU-943): the real send at flush suppresses its own
    // bubble, so this push is the row's ONLY chance to be attributed — without
    // it a warmed-up agent's first message stays nameless in a shared thread.
    // `mentions` rides for the same reason (HOU-944): this push is the only
    // chance the bubble ever gets to chip the teammates it named.
    pushPendingUserMessage(
      args.agentPath,
      args.sessionKey,
      args.text,
      actingUser(),
      args.mentions,
    );
  }
  const send = warmingSendRecord(args);
  if (args.buildPrompt) promptBuilders.set(send.id, args.buildPrompt);
  return send;
}

/**
 * After a relaunch mid-warm-up: the VM is empty, so re-render the queued
 * bubbles. Only when the conversation truly has nothing — a live VM already
 * shows them. Re-stamped with the acting user for the same reason as the
 * original push: the queue is this account's own, and the flush's send will
 * suppress the bubble that would otherwise carry the name.
 */
export function restoreWarmingBubbles(entry: ProvisioningEntry): void {
  const author = actingUser();
  for (const send of entry.pendingSends ?? []) {
    if (send.rowOnly || send.text.length === 0) continue;
    if (getConversationFeed(entry.agentPath, send.sessionKey).length === 0) {
      pushPendingUserMessage(
        entry.agentPath,
        send.sessionKey,
        send.text,
        author,
        send.mentions,
      );
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
    let built: string | undefined;
    if (build) {
      try {
        built = await build();
      } catch (e) {
        // The attachment save failed (already toasted by its own wrapper).
        // What still goes out is `chooseWarmingPrompt`'s call: the prompt
        // resolved at queue time, else the user's own words. A send that has
        // neither is reported and skipped below.
        logger.error(`[warming-sends] prompt build failed: ${e}`);
      }
    }
    // The conversation's board row lands here, not at send time.
    const landing = await landWarmingRow(entry, send);
    if (landing.kind === "aborted") return;
    const { rowId } = landing;
    // Row-only entry (the welcome mission): the row IS the payload.
    if (send.rowOnly) continue;
    const wire = chooseWarmingPrompt(send, built);
    if (!wire) {
      // Nothing to put on the wire. This send's whole message was hidden in a
      // prompt (its `text` is empty by design) and neither the live builder
      // nor the queue-time copy survived — an empty turn is refused by the
      // runtime, so sending it would only trade a missing mission for a
      // cryptic one. The row above still landed, so the conversation exists
      // and the user can write in it: report, hand the card back to them, and
      // move on to the next send.
      const undeliverable = undeliverableSend(send, rowId);
      reportError("warming_sends_prompt", undeliverable.reason);
      if (
        undeliverable.settleRow &&
        !(await settleWarmingRow(entry, undeliverable.settleRow, send))
      ) {
        return;
      }
      continue;
    }
    if ((await wireWarmingSend(entry, send, wire, rowId)) === "abort") return;
  }
}
