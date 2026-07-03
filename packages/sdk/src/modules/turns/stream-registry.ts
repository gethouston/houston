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
 * Copy for a concurrent double-send: a second turn fired at the same
 * conversation while the first send is still in flight. Product voice (no
 * status codes) — the live rendering is left untouched, so the observer/first
 * turn keeps showing progress and this only explains the ignored duplicate.
 */
export const SEND_IN_FLIGHT_MESSAGE = "A message is already being sent.";

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

export const streamKey = (agentPath: string, sessionKey: string): string =>
  JSON.stringify([agentPath, sessionKey]);

/**
 * The set of live conversation streams for ONE owner (one {@link
 * import("../../sdk").HoustonSdk} instance, or the web adapter). It was a
 * package-level singleton — two owners sharing one map meant `disposeAll` on
 * one aborted the other's streams and same-key streams collided across owners.
 * Now each owner constructs its own instance and threads it explicitly into
 * {@link import("./turn-stream").streamTurn} / {@link
 * import("./observe-stream").observeConversation}; there is no hidden global.
 */
export class StreamRegistry {
  private readonly active = new Map<string, ActiveStream>();
  /** Keys with a turn send in flight — the observer→turn handoff double-send guard. */
  private readonly sending = new Set<string>();

  get(key: string): ActiveStream | undefined {
    return this.active.get(key);
  }
  set(key: string, entry: ActiveStream): void {
    this.active.set(key, entry);
  }
  delete(key: string): void {
    this.active.delete(key);
  }
  /** Remove `entry` only if it still owns `key` (a successor may have replaced it). */
  release(key: string, entry: ActiveStream): void {
    if (this.active.get(key) === entry) this.active.delete(key);
  }

  /**
   * Claim the per-key send lock. Returns `true` if this caller now owns the
   * in-flight send, `false` if one is already running for `key` — closing the
   * observer→turn handoff window where two near-simultaneous `streamTurn` calls
   * both saw the observer as prior and both fired a real send. Release with
   * {@link endSend} once the turn stream is claimed (or the send failed).
   */
  beginSend(key: string): boolean {
    if (this.sending.has(key)) return false;
    this.sending.add(key);
    return true;
  }
  endSend(key: string): void {
    this.sending.delete(key);
  }

  /**
   * Abort every live conversation stream (turns and observers alike). Wired to
   * the engine-client teardown seam (`EngineWebSocket.disconnect`, i.e. logout /
   * mode change) so an orphaned subscription never outlives its client. Sinks
   * are NOT settled: the UI is going away with the client.
   */
  disposeAll(): void {
    for (const s of this.active.values()) s.dispose();
    this.active.clear();
    this.sending.clear();
  }
}
