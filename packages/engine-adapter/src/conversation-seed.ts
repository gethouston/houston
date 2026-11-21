import {
  conversationScope,
  type FeedFrame,
  type HistoryWindowVM,
  type MarkedRead,
  readPastOwnTurns,
  streamKey,
} from "@houston/sdk";
import { registry } from "./adapter-streams";
import { decideServerSeed, type SeedFrame } from "./history-window";
import { conversationStore, conversationVm } from "./vm";

export function historyReadMark(agentPath: string, sessionKey: string): number {
  return registry.turnsStarted(streamKey(agentPath, sessionKey));
}

export function ownTurnHolds(agentPath: string, sessionKey: string): boolean {
  return registry.ownsTurn(streamKey(agentPath, sessionKey));
}

export function ownTurnInFlight(): boolean {
  return registry.ownsAnyTurn();
}

export function readPastOwnTurnsOn<T>(
  agentPath: string,
  sessionKey: string,
  read: () => Promise<T>,
): Promise<MarkedRead<T>> {
  return readPastOwnTurns(registry, streamKey(agentPath, sessionKey), read);
}

export function seedConversationVm(
  agentPath: string,
  sessionKey: string,
  frames: FeedFrame[],
  readMark: number | null,
  window?: HistoryWindowVM,
): void {
  const key = streamKey(agentPath, sessionKey);
  if (registry.get(key)) return;
  if (readMark === null || registry.turnsStarted(key) !== readMark) return;
  const current = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as { feed?: SeedFrame[]; historyWindow?: HistoryWindowVM } | undefined;
  const curFeed = current?.feed ?? [];
  if (!window) {
    if (curFeed.length >= frames.length) return;
    conversationVm.seedHistory(agentPath, sessionKey, frames);
    return;
  }
  const decision = decideServerSeed(
    curFeed,
    frames,
    current?.historyWindow !== undefined,
  );
  if (decision === "replace") {
    conversationVm.seedHistory(agentPath, sessionKey, frames, window);
  } else if (decision === "stamp") {
    conversationVm.stampHistoryWindow(agentPath, sessionKey, window);
  }
}
