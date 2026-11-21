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

export type LiveTurn = "none" | "streaming" | "held";

export function liveTurn(agentPath: string, sessionKey: string): LiveTurn {
  const key = streamKey(agentPath, sessionKey);
  const entry = registry.get(key);
  if (registry.isSending(key) || (entry?.kind === "turn" && entry.held))
    return "held";
  return entry?.kind === "turn" ? "streaming" : "none";
}

export function stopUnsentTurn(
  agentPath: string,
  sessionKey: string,
): (() => void) | null {
  return registry.stopUnsent(streamKey(agentPath, sessionKey));
}

export function disposeAllStreams(): void {
  registry.disposeAll();
}

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

export function truncateConversationVm(
  agentPath: string,
  sessionKey: string,
  turnId: string,
): boolean {
  return conversationVm.truncateFromTurn(agentPath, sessionKey, turnId);
}

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
    mentions: mentions?.length ? mentions : undefined,
  });
}

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
