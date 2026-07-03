import type { ResumableBackoff } from "@houston/runtime-client";

/** Reconnect knobs, injectable so tests don't sit through real backoff. */
export interface StreamTuning {
  idleTimeoutMs?: number;
  backoff?: ResumableBackoff;
}

/**
 * Consecutive frameless connection attempts before a subscription gives up
 * (~30s at the default backoff cap): a turn settles as an error (the old
 * dead-server UX, not an eternal spinner); an observer disposes silently.
 */
export const STREAM_FAILURE_BUDGET = 6;
/** Budget-exhaustion copy when no attempt surfaced a concrete error. */
export const STREAM_LOST_MESSAGE = "Lost the connection to the engine.";

/**
 * One live subscription per conversation, whoever opened it: a turn we sent
 * (`streamTurn`) or a passive observer (`observeConversation`). The registry
 * keeps the two from double-subscribing — duplicate streams would render
 * every frame twice.
 */
export interface ActiveStream {
  kind: "turn" | "observer";
  dispose: () => void;
  /** Last seen envelope seq — the observer→turn handoff cursor. */
  lastSeq?: number;
}

const activeStreams = new Map<string, ActiveStream>();

export const streamKey = (agentPath: string, sessionKey: string): string =>
  JSON.stringify([agentPath, sessionKey]);

export function getStream(key: string): ActiveStream | undefined {
  return activeStreams.get(key);
}
export function setStream(key: string, entry: ActiveStream): void {
  activeStreams.set(key, entry);
}
export function deleteStream(key: string): void {
  activeStreams.delete(key);
}
/** Remove `entry` only if it still owns `key` (a successor may have replaced it). */
export function releaseStream(key: string, entry: ActiveStream): void {
  if (activeStreams.get(key) === entry) activeStreams.delete(key);
}

/**
 * Abort every live conversation stream (turns and observers alike). Wired to
 * the engine-client teardown seam (`EngineWebSocket.disconnect`, i.e. logout /
 * mode change) so an orphaned subscription never outlives its client. Sinks
 * are NOT settled: the UI is going away with the client.
 */
export function disposeAllStreams(): void {
  for (const s of activeStreams.values()) s.dispose();
  activeStreams.clear();
}
