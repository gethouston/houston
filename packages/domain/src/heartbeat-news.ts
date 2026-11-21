import { keyOfAgent } from "./heartbeat-sections";
import type { HeartbeatSnapshot } from "./heartbeat-snapshot";

export function heartbeatHasNews(snapshot: HeartbeatSnapshot): boolean {
  return snapshot.unseen > 0;
}

export const HEARTBEAT_LOOKBACK_MS = 48 * 60 * 60 * 1000;

export function heartbeatWindowStart(nowMs: number): number {
  return nowMs - HEARTBEAT_LOOKBACK_MS;
}

export function seenAfterDelivery(
  snapshot: HeartbeatSnapshot,
  seen: readonly string[],
): string[] {
  const present = new Set(snapshot.presentKeys);
  const kept = seen.filter(
    (k) =>
      present.has(k) || snapshot.unreadAgents.some((a) => keyOfAgent(k, a)),
  );
  return [...new Set([...snapshot.namedKeys, ...kept])];
}
