/**
 * Completion-notification latches, keyed by `agentPath::sessionKey`.
 *
 * A session's OS notification is latched at `SessionStatus completed` and fired
 * on the settle's `ActivityChanged` echo — the ordering where the interaction
 * the turn ended on has been folded into the conversation VM (by
 * `persistBoardStatus`) and is readable, so the body reads question / connect /
 * plain finish correctly.
 *
 * The catch: `ActivityChanged` carries only an `agentPath`, no session key (see
 * `packages/protocol/src/events.ts`). So a single agent's echo can't name WHICH
 * of its sessions settled. Firing every latch for the agent is wrong: a second
 * session that completed in the same batch — or an unrelated `.houston` write
 * that also emits `ActivityChanged` — would fire a latch whose own settle hasn't
 * folded yet, sending it the plain body and then discarding it, so its real echo
 * has nothing left to correct. The `ready` gate closes that window: a latch
 * fires on an agent echo ONLY once its own settle has folded; a premature echo
 * is skipped, leaving the latch for the session's own (later) echo. The grace
 * timer force-fires as the backstop for a completed session this client never
 * folds a VM for (no board card).
 */

/** The clock seam — real timers in the app, controllable ones in tests. */
export interface LatchTimers {
  set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (handle: ReturnType<typeof setTimeout>) => void;
}

interface Latch {
  agentPath: string;
  /** True once this session's settle has folded (its notification body is
   *  readable). A non-forced fire is skipped until this returns true. */
  ready: () => boolean;
  /** Build + deliver the notification (reads the folded body at fire time). */
  send: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const defaultTimers: LatchTimers = { set: setTimeout, clear: clearTimeout };

export class CompletionLatches {
  private readonly map = new Map<string, Latch>();
  private readonly graceMs: number;
  private readonly timers: LatchTimers;

  constructor(graceMs: number, timers: LatchTimers = defaultTimers) {
    this.graceMs = graceMs;
    this.timers = timers;
  }

  /**
   * Latch a completed session's notification. Re-latching the same key resets
   * its grace timer (a session that completes twice keeps one pending latch).
   */
  latch(
    agentPath: string,
    sessionKey: string,
    ready: () => boolean,
    send: () => void,
  ): void {
    const key = `${agentPath}::${sessionKey}`;
    const existing = this.map.get(key);
    if (existing) this.timers.clear(existing.timer);
    const timer = this.timers.set(() => this.fire(key, true), this.graceMs);
    this.map.set(key, { agentPath, ready, send, timer });
  }

  /**
   * An `ActivityChanged` echo landed for `agentPath`. Fire every latched
   * completion for that agent whose OWN settle has folded; leave the rest for
   * their own echo (this echo may belong to a sibling session or an unrelated
   * write).
   */
  fireForAgent(agentPath: string): void {
    // Snapshot keys first: `fire` mutates the map (deletes the fired entry).
    for (const [key, entry] of [...this.map]) {
      if (entry.agentPath === agentPath) this.fire(key, false);
    }
  }

  /** Clear every pending timer and drop all latches (hook teardown). */
  dispose(): void {
    for (const entry of this.map.values()) this.timers.clear(entry.timer);
    this.map.clear();
  }

  private fire(key: string, force: boolean): void {
    const entry = this.map.get(key);
    if (!entry) return;
    // A non-forced (echo-driven) fire waits until this session's settle folded,
    // so a sibling's or an unrelated write's echo can't fire it with the wrong
    // body. The grace timer forces past the gate.
    if (!force && !entry.ready()) return;
    this.timers.clear(entry.timer);
    this.map.delete(key);
    entry.send();
  }
}
