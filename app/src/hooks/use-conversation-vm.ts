import { conversationStore } from "@houston/engine-adapter";
import type { ConversationVM } from "@houston/sdk";
import { conversationScope } from "@houston/sdk";
import { useSdkSnapshot } from "@houston/sdk/react";
import type { FeedItem } from "@houston-ai/chat";
import { useMemo } from "react";
import { toDisplayProviderId } from "../lib/provider-overrides";

function remapItem(item: { feed_type: string; data: unknown }): FeedItem {
  if (
    (item.feed_type === "provider_switched" ||
      item.feed_type === "provider_error") &&
    typeof (item.data as { provider?: unknown })?.provider === "string"
  ) {
    const data = item.data as { provider: string };
    return {
      ...item,
      data: { ...data, provider: toDisplayProviderId(data.provider) },
    } as FeedItem;
  }
  return item as FeedItem;
}

export type ConversationTurnStatus =
  | ConversationVM["sessionStatus"]
  | "wrapping_up";

function turnStatusOf(
  vm: ConversationVM | undefined,
): ConversationTurnStatus | undefined {
  if (vm?.sessionStatus === "running" && vm.replyComplete) return "wrapping_up";
  return vm?.sessionStatus;
}

export interface ConversationView {
  feed: FeedItem[];
  running: boolean;
  sessionStatus: ConversationVM["sessionStatus"];
  turnStatus: ConversationTurnStatus;
  boardStatus: ConversationVM["boardStatus"];
  queued: ConversationVM["queued"];
  pendingInteraction: ConversationVM["pendingInteraction"];
  historyWindow: ConversationVM["historyWindow"];
  sendWaiting: ConversationVM["sendWaiting"];
}

const EMPTY_FEED: FeedItem[] = [];

function toView(vm: ConversationVM): ConversationView {
  return {
    feed: vm.feed.map(remapItem),
    running: vm.running,
    sessionStatus: vm.sessionStatus,
    turnStatus: turnStatusOf(vm) ?? vm.sessionStatus,
    boardStatus: vm.boardStatus,
    queued: vm.queued,
    pendingInteraction: vm.pendingInteraction,
    historyWindow: vm.historyWindow,
    sendWaiting: vm.sendWaiting,
  };
}

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

export function useConversationStatus(
  agentPath: string | null | undefined,
  sessionKey: string | null | undefined,
): ConversationTurnStatus | undefined {
  const scope =
    agentPath && sessionKey
      ? conversationScope(agentPath, sessionKey)
      : "conversation/none";
  return turnStatusOf(useSdkSnapshot<ConversationVM>(conversationStore, scope));
}

export function useConversationFeed(
  agentPath: string | null | undefined,
  sessionKey: string | null | undefined,
): FeedItem[] {
  return useConversationVm(agentPath, sessionKey)?.feed ?? EMPTY_FEED;
}

export function getConversationFeed(
  agentPath: string,
  sessionKey: string,
): FeedItem[] {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm ? vm.feed.map(remapItem) : EMPTY_FEED;
}

export function getConversationStatus(
  agentPath: string,
  sessionKey: string,
): ConversationTurnStatus | undefined {
  return turnStatusOf(
    conversationStore.getSnapshot(conversationScope(agentPath, sessionKey)) as
      | ConversationVM
      | undefined,
  );
}

export function getConversationInteraction(
  agentPath: string,
  sessionKey: string,
): ConversationVM["pendingInteraction"] | undefined {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm?.pendingInteraction;
}

export function getConversationBoardStatus(
  agentPath: string,
  sessionKey: string,
): ConversationVM["boardStatus"] | undefined {
  const vm = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return vm?.boardStatus;
}
