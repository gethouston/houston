export * from "./stream-tuning";

import type { ActiveStream } from "./active-stream";

export { type ActiveStream, streamKey } from "./active-stream";

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

  /** Wakers for callers waiting on an entry to leave its key. */
  private readonly leaving = new Set<() => void>();
  /** Turns this owner started per key, ever. Never cleared, so it only grows. */
  private readonly turnStarts = new Map<string, number>();
  private disposeCount = 0;

  /**
   * Count a turn this owner starts on `key`, and answer `key`. Noted before
   * its optimistic bubble, so any history read already out by then is
   * provably older than the turn the feed is about to show. A send refused
   * before it went out (a duplicate) is counted too: a read it overtook is
   * only taken again, never trusted less.
   */
  noteTurnStart(key: string): string {
    this.turnStarts.set(key, this.turnsStarted(key) + 1);
    return key;
  }
  /**
   * How many turns this owner has started on `key`. A history read takes it
   * when it goes out: if it moved by the time the read answers, the fold
   * predates a turn on screen and must not replace the feed holding it.
   */
  turnsStarted(key: string): number {
    return this.turnStarts.get(key) ?? 0;
  }
  /** Whether a turn this owner sent holds `key`: its stream, or its send
   *  still handing off over an observer. Someone else's turn is not one. */
  ownsTurn(key: string): boolean {
    return this.active.get(key)?.kind === "turn" || this.sending.has(key);
  }
  /** Whether such a turn's send is still out: the engine has not taken it
   *  ({@link ActiveStream.accepted}), so the host may not hold its prompt. */
  ownsUnacceptedSend(key: string): boolean {
    const entry = this.active.get(key);
    return this.sending.has(key) || (entry?.kind === "turn" && !entry.accepted);
  }
  /** Whether a turn this owner sent holds ANY conversation: what the desktop
   *  updater asks before an install would pull the app out from under a send. */
  ownsAnyTurn(): boolean {
    if (this.sending.size > 0) return true;
    for (const entry of this.active.values()) {
      if (entry.kind === "turn") return true;
    }
    return false;
  }
  /** Resolves once {@link ownsTurn} is false for `key`. A teardown
   *  ({@link disposeAll}) releases every key, so it never outlives one. */
  ownTurnLeft(key: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this.ownsTurn(key)) return;
        this.leaving.delete(check);
        resolve();
      };
      this.leaving.add(check);
      check();
    });
  }
  /** How many teardowns ({@link disposeAll}) this registry has seen. */
  get disposals(): number {
    return this.disposeCount;
  }

  get(key: string): ActiveStream | undefined {
    return this.active.get(key);
  }
  set(key: string, entry: ActiveStream): void {
    this.active.set(key, entry);
    this.wakeLeaving();
  }
  delete(key: string): void {
    this.active.delete(key);
    this.wakeLeaving();
  }
  /** Stop hooks of sends still out over an observer (the handoff's POST). */
  private readonly sendStops = new Map<string, () => (() => void) | null>();

  /**
   * The person pressed Stop: end `key`'s message locally when the engine has
   * not accepted it yet (see {@link ActiveStream.stopUnsent}), a turn's or a
   * handoff's. Answers the `finish` to call once the engine's cancel answered,
   * or null when nothing was waiting.
   */
  stopUnsent(key: string): (() => void) | null {
    const entry = this.active.get(key);
    if (entry?.kind === "turn" && entry.stopUnsent) return entry.stopUnsent();
    return this.sendStops.get(key)?.() ?? null;
  }
  /** Arm `stop` for the send `key`'s observer handoff has out. */
  armSendStop(key: string, stop: () => (() => void) | null): void {
    this.sendStops.set(key, stop);
  }
  disarmSendStop(key: string, stop: () => (() => void) | null): void {
    if (this.sendStops.get(key) === stop) this.sendStops.delete(key);
  }
  /** Remove `entry` only if it still owns `key` (a successor may have replaced it). */
  release(key: string, entry: ActiveStream): void {
    if (this.active.get(key) === entry) this.delete(key);
  }

  /**
   * Resolves once `entry` no longer owns `key` (settled, replaced or torn
   * down), or `signal` aborts. A send held behind an observed turn waits here
   * for that turn's observer to settle.
   */
  left(key: string, entry: ActiveStream, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.leaving.delete(check);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const check = () => {
        if (this.active.get(key) !== entry) done();
      };
      if (this.active.get(key) !== entry || signal.aborted) return resolve();
      this.leaving.add(check);
      signal.addEventListener("abort", done, { once: true });
    });
  }
  private wakeLeaving(): void {
    for (const check of Array.from(this.leaving)) check();
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
    // A refused handoff ends its send with no entry change: wake the reads
    // waiting on it, not only those waiting on an entry.
    this.wakeLeaving();
  }
  /** Whether `key`'s send lock is still held (a teardown releases it). */
  isSending(key: string): boolean {
    return this.sending.has(key);
  }

  /**
   * Abort every live conversation stream (turns and observers alike). Wired to
   * the engine adapter's teardown seam (`EngineWebSocket.disconnect`, i.e. logout /
   * mode change) so an orphaned subscription never outlives its client. Sinks
   * are NOT settled: the UI is going away with the client.
   */
  disposeAll(): void {
    for (const s of this.active.values()) s.dispose();
    this.active.clear();
    this.sending.clear();
    this.sendStops.clear();
    this.disposeCount++;
    this.wakeLeaving();
  }
}
