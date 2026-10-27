import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  type BoardPersistOptions,
  type BoardStatus,
  type FeedAuthor,
  type FeedMention,
  MultiplexFeedOutput,
  type PendingInteraction,
  type StreamTuning,
  type StreamTurnOptions,
  observeConversation as sdkObserveConversation,
  streamTurn as sdkStreamTurn,
  streamKey,
} from "@houston/sdk";
import { registry } from "./adapter-streams";
import { cachePersistOutput } from "./cache-persist";
import { createBusFeedOutput } from "./feed-output";
import { conversationVm } from "./vm";

export type { StreamTuning } from "@houston/sdk";

/**
 * A turn THIS client dispatched on the conversation, as the queue watchdog
 * sees it. `streaming`: its stream settles only on the turn's terminal frame
 * or its failure budget, so it is the authority on "the turn is over".
 * `held`: its send waits behind another turn (or is handing off over an
 * observer) and settles by itself; a flush would dispose it and lose it.
 */
export type LiveTurn = "none" | "streaming" | "held";

export function liveTurn(agentPath: string, sessionKey: string): LiveTurn {
  const key = streamKey(agentPath, sessionKey);
  const entry = registry.get(key);
  if (registry.isSending(key) || (entry?.kind === "turn" && entry.held))
    return "held";
  return entry?.kind === "turn" ? "streaming" : "none";
}

/**
 * The person pressed Stop: end the conversation's message here when it has
 * not gone out yet (the SDK's `StreamRegistry.stopUnsent`). Answers the
 * `finish` to call once the engine's cancel answered, or null.
 */
export function stopUnsentTurn(
  agentPath: string,
  sessionKey: string,
): (() => void) | null {
  return registry.stopUnsent(streamKey(agentPath, sessionKey));
}

/** Abort every live conversation stream this adapter owns (WS teardown seam). */
export function disposeAllStreams(): void {
  registry.disposeAll();
}

/**
 * Every stream folds into ALL halves: the conversation VM (the app's one
 * turn-state source, read via `useSdkSnapshot`), the legacy event bus
 * (which still drives query invalidation and notifications — events, not
 * state), and the settle-time local-cache persist (order matters: the VM
 * folds first so the cache snapshots a settled feed).
 */
function composedOutput(
  setActivityStatus: (
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ) => Promise<void>,
) {
  return new MultiplexFeedOutput([
    conversationVm,
    createBusFeedOutput((_a, _s, status, pendingInteraction, opts) =>
      setActivityStatus(status, pendingInteraction, opts),
    ),
    cachePersistOutput(),
  ]);
}

/**
 * Fold the edit-and-resend rewind (PRODUCT-1217) into the conversation VM:
 * drop the feed tail from the edited user turn onward. Called AFTER the
 * runtime accepted the truncation. Explicit because `seedConversationVm`
 * deliberately skips a shorter server fold — the loaded-pages guard would
 * swallow the rewind and leave the dropped turns on screen.
 */
export function truncateConversationVm(
  agentPath: string,
  sessionKey: string,
  turnId: string,
): boolean {
  return conversationVm.truncateFromTurn(agentPath, sessionKey, turnId);
}

/**
 * Show a user's message in the conversation VM BEFORE any turn exists — the
 * warming-engine send queue (HOU-693): the message is held client-side until
 * the just-created agent's engine answers, but the user must see it as sent
 * immediately. The eventual real send goes out with `suppressUserBubble` so
 * the bubble is never doubled.
 *
 * `author` is the acting user, same shape and purpose as {@link streamTurn}'s
 * (HOU-943): because the real send SUPPRESSES its own bubble, this push is the
 * only chance this row ever gets to name its sender — without it a warmed-up
 * agent's first message would sit permanently unattributed in a shared thread.
 * `mentions` rides along for the same reason (HOU-944): this is the only push
 * that can chip the teammates the message named.
 */
export function pushPendingUserMessage(
  agentPath: string,
  sessionKey: string,
  text: string,
  author?: FeedAuthor,
  mentions?: FeedMention[],
): void {
  conversationVm.pushFeedItem(agentPath, sessionKey, {
    feed_type: "user_message",
    data: text,
    author,
    // An empty list means what absence means: nobody was mentioned.
    mentions: mentions?.length ? mentions : undefined,
  });
}

/**
 * The web adapter's turn entry. The turn/feed machinery lives in `@houston/sdk`;
 * this drives it with a bus-backed {@link createBusFeedOutput} FeedOutput.
 * `setActivityStatus` is already bound to this turn's conversation, so the
 * FeedOutput ignores the (agentPath, sessionKey) it re-supplies. Everything
 * optional rides one options bag, forwarded to the SDK unchanged.
 */
export function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
  setActivityStatus: (
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ) => Promise<void>,
  opts: StreamTurnOptions = {},
): Promise<void> {
  return sdkStreamTurn(
    engine,
    agentPath,
    sessionKey,
    prompt,
    composedOutput(setActivityStatus),
    registry,
    opts,
  );
}

/** Passively observe a conversation (see the SDK's `observeConversation`). */
export function observeConversation(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  setActivityStatus: (
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ) => Promise<void>,
  messagesAtOpen: number,
  tuning?: StreamTuning,
): void {
  sdkObserveConversation(
    engine,
    agentPath,
    sessionKey,
    composedOutput(setActivityStatus),
    messagesAtOpen,
    registry,
    tuning,
  );
}
