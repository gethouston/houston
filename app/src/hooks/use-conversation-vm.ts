import type { ConversationVM } from "@houston/sdk";
import { conversationScope } from "@houston/sdk";
import { useSdkSnapshot } from "@houston/sdk/react";
import type { FeedItem } from "@houston-ai/chat";
import { conversationStore } from "@houston-ai/engine-client";
import { useMemo } from "react";

/**
 * The app's ONE binding to the SDK conversation VM (the engine-adapter's
 * `conversationStore`). Components read a conversation's feed, spinner, and
 * status from here — never from an app-side accumulation of feed events.
 *
 * The VM carries ENGINE provider ids; the desktop UI resolves the OLD ids
 * (only codex differs), so the two provider-naming feed items are remapped
 * here — the one place, for seeded history and live pushes alike. Dies with
 * the old-id vocabulary sweep. Keep in sync with the adapter's
 * `toOldProvider` (`packages/web/src/engine-adapter/synthetic.ts`).
 */
function toOldProvider(id: string): string {
  return id === "openai-codex" ? "openai" : id;
}

function remapItem(item: { feed_type: string; data: unknown }): FeedItem {
  if (
    (item.feed_type === "provider_switched" ||
      item.feed_type === "provider_error") &&
    typeof (item.data as { provider?: unknown })?.provider === "string"
  ) {
    const data = item.data as { provider: string };
    return {
      ...item,
      data: { ...data, provider: toOldProvider(data.provider) },
    } as FeedItem;
  }
  return item as FeedItem;
}

/** The remapped view a component consumes. `feed` is referentially stable per published snapshot. */
export interface ConversationView {
  feed: FeedItem[];
  running: boolean;
  sessionStatus: ConversationVM["sessionStatus"];
  boardStatus: ConversationVM["boardStatus"];
  queued: ConversationVM["queued"];
  /** What this conversation ended waiting on the user for (ask_user /
   *  request_connection), or null. Set on settle, cleared on the next turn
   *  start — drives the composer-replacing interaction card. */
  pendingInteraction: ConversationVM["pendingInteraction"];
  /** The server-transcript window the feed was seeded from (HOU-819):
   *  `earliestLoaded > 0` means older messages exist server-side and the chat
   *  offers scroll-up lazy-load. Absent before any windowed read. */
  historyWindow: ConversationVM["historyWindow"];
}

const EMPTY_FEED: FeedItem[] = [];

function toView(vm: ConversationVM): ConversationView {
  return {
    feed: vm.feed.map(remapItem),
    running: vm.running,
    sessionStatus: vm.sessionStatus,
    boardStatus: vm.boardStatus,
    queued: vm.queued,
    pendingInteraction: vm.pendingInteraction,
    historyWindow: vm.historyWindow,
  };
}

/**
 * Subscribe to one conversation's VM. `undefined` until anything was published
 * for it (a fresh conversation before its first history load or turn).
 */
export function useConversationVm(
  agentPath: string | null | undefined,
  sessionKey: string | null | undefined,
): ConversationView | undefined {
  const scope =
    agentPath && sessionKey
      ? conversationScope(agentPath, sessionKey)
      : "conversation/none";
  const vm = useSdkSnapshot<ConversationVM>(conversationStore, scope);
  return useMemo(
    () => (agentPath && sessionKey && vm ? toView(vm) : undefined),
    [agentPath, sessionKey, vm],
  );
}

/** The conversation's feed (remapped), or [] before anything published. */
export function useConversationFeed(
  agentPath: string | null | undefined,
  sessionKey: string | null | undefined,
): FeedItem[] {
  return useConversationVm(agentPath, sessionKey)?.feed ?? EMPTY_FEED;
}

/**
 * Synchronous, non-reactive read of a conversation's feed — for send-time
 * decisions (autocompact's context-usage scan), not for rendering.
 */
export function getConversationFeed(
  agentPath: string,
  sessionKey: string,
): FeedItem[] {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm ? vm.feed.map(remapItem) : EMPTY_FEED;
}

/**
 * Synchronous, non-reactive read of a conversation's status — for cross-agent
 * scans (the board's loading rollup) where per-session subscriptions don't
 * fit. `undefined` = nothing published for this conversation yet.
 */
export function getConversationStatus(
  agentPath: string,
  sessionKey: string,
): ConversationVM["sessionStatus"] | undefined {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm?.sessionStatus;
}

/**
 * Synchronous, non-reactive read of a conversation's settled interaction — for
 * the completion-notification body (use-session-events). The VM folds it via
 * `persistBoardStatus`, which runs AFTER the `SessionStatus` bus event but
 * BEFORE the `ActivityChanged` echo that same persist emits, so reading here on
 * that echo sees the settled value. `undefined` = nothing published for this
 * conversation yet; `null` = settled with nothing outstanding.
 */
export function getConversationInteraction(
  agentPath: string,
  sessionKey: string,
): ConversationVM["pendingInteraction"] | undefined {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm?.pendingInteraction;
}

/**
 * Synchronous, non-reactive read of a conversation's board-card status — the
 * completion latch's readiness gate (use-session-events). `persistBoardStatus`
 * flips it from "running" to a terminal value in the SAME fold that stamps the
 * settled interaction, so "not running" is the signal the notification body is
 * readable. `undefined`/`null` = no board card folded for this conversation.
 */
export function getConversationBoardStatus(
  agentPath: string,
  sessionKey: string,
): ConversationVM["boardStatus"] | undefined {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm?.boardStatus;
}
