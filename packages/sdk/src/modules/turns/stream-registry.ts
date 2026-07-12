import type { ResumableBackoff } from "@houston/runtime-client";

/** Reconnect knobs, injectable so tests don't sit through real backoff. */
export interface StreamTuning {
  idleTimeoutMs?: number;
  backoff?: ResumableBackoff;
  /**
   * Grace before an AMBIGUOUS send failure (transport error — the engine may
   * or may not have received the POST) settles the turn as an error. Within
   * the window the live stream can prove the send landed (nonce echo /
   * running sync) and the turn proceeds as if the send had succeeded.
   */
  sendVerdictMs?: number;
  /**
   * Grace before the PRE-SETTLED poll fires (see {@link PRESETTLED_POLL_MS}).
   * A turn that completes BEFORE our subscription's first sync leaves us with a
   * fresh idle sync and no frames ever replayed; after this grace with still no
   * stream evidence, the sink reloads history and settles ONLY on conclusive
   * proof the turn finished. Tests shrink it to fire quickly.
   */
  presettledPollMs?: number;
}

/**
 * Consecutive frameless connection attempts before a subscription gives up:
 * a turn settles as an error (the old dead-server UX, not an eternal
 * spinner); an observer disposes silently. Attempts that fail FAST (dead
 * local sidecar refusing the connection) spend it in ~45s of backoff; an
 * attempt that HANGS costs a full 45s idle watchdog, so the budget must
 * outlast the cloud gateway's cold-wake hold — ensureAwake keeps every
 * request open for up to 300s while the agent pod starts, and a budget of 6
 * used to give up at ~283s, moments before a slow wake would have delivered
 * (HOU-705). 8 hung attempts ≈ 6+ minutes, past the gateway's own verdict.
 */
export const STREAM_FAILURE_BUDGET = 8;
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
 * How long an ambiguously-failed send (see {@link StreamTuning.sendVerdictMs})
 * waits for the stream to prove the turn started before settling as an error.
 * Long enough for the resumable stream to ride out the same network blip that
 * broke the send (a few backoff attempts), short enough that a genuinely lost
 * send doesn't leave the user staring at a spinner.
 */
export const SEND_VERDICT_MS = 15_000;
/**
 * How long the sink waits, after a FRESH idle sync in turn mode with the send
 * accepted, before it suspects the turn completed BEFORE the subscription's
 * first sync (the fake host's ~45ms canned reply, or a real instant error /
 * cancel) — a window in which the user echo, frames and terminal were all
 * emitted before we attached and are never replayed, so the stream carries no
 * evidence and the card would hang on "running" forever (0407aaa0). On fire the
 * sink reloads history and settles ONLY on conclusive proof the turn finished;
 * inconclusive (a healthy slow turn whose reply hasn't persisted) re-arms the
 * poll, and any stream evidence cancels it. Long enough that a turn that simply
 * hasn't started yet isn't polled needlessly, short enough that a genuinely
 * pre-settled turn leaves the spinner quickly.
 */
export const PRESETTLED_POLL_MS = 1_500;
/**
 * Copy for a send that provably never landed: the send fetch failed at the
 * transport level AND no evidence of the turn arrived within the verdict
 * window. Product voice (no status codes, no `TypeError: Load failed`), and
 * actionable — resending is safe precisely because the turn never started.
 */
export const SEND_LOST_MESSAGE =
  "Your message didn't reach the agent. Check your connection and send it again.";

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
