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
 * Which prompt the flush puts on the wire — the live builder's, the one
 * resolved at queue time, or the user's own words — is `warming-send-prompt.ts`.
 */

import type { ActivityStatus } from "@houston/engine-adapter";
import { pushPendingUserMessage } from "@houston/engine-adapter";
import { getConversationFeed } from "../hooks/use-conversation-vm";
import { actingUser } from "./acting-user";
import { isAgentGoneError } from "./agent-gone";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning";
import { getEngine } from "./engine";
import { reportError } from "./error-report";
import { showErrorToast } from "./error-toast";
import { hiddenPromptDisplayText } from "./hidden-prompt-display-text";
import i18n from "./i18n";
import { logger } from "./logger";
import { refreshMissionTitle } from "./mission-title";
import { healStaleRosterFromError } from "./roster-heal";
import { tauriActivity, tauriChat, tauriProvider } from "./tauri";
import {
  preferRowPin,
  type RowPin,
  verifyWarmingSendPin,
} from "./warming-send-pin";
import {
  chooseWarmingPrompt,
  undeliverableSend,
  type WarmingSendInput,
  warmingSendRecord,
} from "./warming-send-prompt";

/** Prompt builders keyed by send id — in-memory only, lost on reload. */
const promptBuilders = new Map<string, () => Promise<string> | string>();

/** Entries whose flush has started: too late to queue — send normally. */
const flushing = new WeakSet<ProvisioningEntry>();

export function isFlushingWarmingSends(entry: ProvisioningEntry): boolean {
  return flushing.has(entry);
}

/**
 * True when this refusal means the agent vanished between the readiness probe
 * and the write (deleted/unshared elsewhere, HOUSTON-APP-4ZF): every remaining
 * send is doomed to the same "agent not found" 404, so the flush stops and the
 * roster heals instead of surfacing a state the user cannot act on. The probe's
 * own gone-check catches this before the flush starts; this guards the
 * in-flight race.
 */
function abortsFlushAsAgentGone(e: unknown): boolean {
  if (!isAgentGoneError(e)) return false;
  logger.warn(`[warming-sends] agent gone mid-flush, aborting: ${e}`);
  healStaleRosterFromError(e);
  return true;
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
    // The conversation's board row lands here, not at send time: the engine
    // is awake now, and the id-upsert makes a retry of an already-landed row
    // a no-op. A failure loses only the card — the message still delivers.
    let rowId: string | null = null;
    if (send.row) {
      try {
        // `status` settles via the patch below — the create route can't
        // carry it, and its zod may reject unknown keys.
        const { status: rowStatus, ...createInput } = send.row;
        const created = await tauriActivity.createWithId(
          entry.agentPath,
          createInput,
        );
        rowId = created.id;
        // One patch for whatever the create couldn't carry: a non-standard
        // session key — a `welcome-` chat, or version skew where an engine
        // predating client-supplied ids (HOU-693) assigned its own id — so
        // the board card still opens THIS conversation and the turn's status
        // writes still resolve (both match session_key first); plus a status
        // settled while queued (the welcome card's needs_you).
        const patch: { session_key?: string; status?: ActivityStatus } = {};
        if (send.sessionKey !== `activity-${created.id}`) {
          patch.session_key = send.sessionKey;
        }
        if (rowStatus && rowStatus !== created.status) {
          patch.status = rowStatus;
        }
        if (Object.keys(patch).length > 0) {
          await getEngine().updateActivity(entry.agentPath, created.id, patch);
        }
      } catch (e) {
        if (abortsFlushAsAgentGone(e)) return;
        showErrorToast(
          "warming_sends_row",
          "mission row create/update failed",
          undefined,
          { userMessage: i18n.t("chat:errors.missionRowFailed") },
        );
      }
    }
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
      if (undeliverable.settleRow) {
        try {
          await getEngine().updateActivity(
            entry.agentPath,
            undeliverable.settleRow.id,
            { status: undeliverable.settleRow.status },
          );
        } catch (e) {
          if (abortsFlushAsAgentGone(e)) return;
          reportError(
            "warming_sends_row_settle",
            `settling an undeliverable mission row failed (session ${send.sessionKey})`,
            e,
          );
        }
      }
      continue;
    }
    const activityId =
      rowId ??
      (send.sessionKey.startsWith("activity-")
        ? send.sessionKey.slice("activity-".length)
        : undefined);
    // A parked follow-up (no row of its own) carries the composer's guess at
    // the mission's pin — the pod answers now, so read the row's stored pin
    // before verifying it (PRODUCT-1643). A failed read keeps the guess: the
    // wrapper already reported it, and the message still delivers.
    let rowPin: RowPin | undefined;
    if (!send.row) {
      try {
        rowPin = (await tauriActivity.list(entry.agentPath)).find(
          (a) =>
            (a.session_key ?? `activity-${a.id}`) === send.sessionKey ||
            a.id === activityId,
        );
      } catch (e) {
        logger.warn(`[warming-sends] mission pin read failed: ${e}`);
      }
    }
    const pin = await verifyWarmingSendPin({
      agentId: entry.agentPath,
      activityId,
      pin: preferRowPin(rowPin, {
        provider: send.provider,
        model: send.model,
        effort: send.effort,
      }),
      probe: async (agentId, provider) => {
        const statuses = await tauriProvider.checkAllStatusesForAgent(agentId, [
          provider,
        ]);
        return statuses[provider]?.authenticated === true;
      },
      clearActivityPin: async (agentId, id) => {
        try {
          await tauriActivity.update(agentId, id, {
            provider: null,
            model: null,
          });
        } catch (error) {
          logger.error(`[warming-sends] activity pin clear failed: ${error}`);
        }
      },
    });
    // The bubble is already on screen (pushed at queue time, or restored on
    // rehydrate) — never double it. If the scope is somehow empty (renamed
    // agent moved the VM scope), let the turn push it.
    const suppress = getConversationFeed(entry.agentPath, send.sessionKey).some(
      (f) => f.feed_type === "user_message",
    );
    try {
      await tauriChat.send(entry.agentPath, wire.prompt, send.sessionKey, {
        providerOverride: pin.provider,
        modelOverride: pin.model,
        effortOverride: pin.effort,
        modeOverride: send.mode,
        mentions: send.mentions,
        suppressUserBubble: suppress,
        // A prompt from either hidden source (built now, or resolved at queue
        // time) means the bubble must show the user's words instead.
        displayText: hiddenPromptDisplayText(send.text, wire.source !== "text"),
      });
      // The AI title pass this mission skipped at queue time (HOU-713): the
      // row just landed and the engine answers now. Fire-and-forget — a
      // failure keeps the fallback title (refreshMissionTitle logs it).
      if (rowId && send.titleText) {
        void refreshMissionTitle({
          agentPath: entry.agentPath,
          activityId: rowId,
          text: send.titleText,
        });
      }
    } catch (e) {
      if (abortsFlushAsAgentGone(e)) return;
      // tauriChat.send already toasted the real reason; keep flushing the
      // rest — one refused turn must not strand the queue.
      logger.error(`[warming-sends] deferred send failed: ${e}`);
    }
  }
}
