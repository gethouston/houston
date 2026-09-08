import { loadActivities } from "@houston/domain";
import type { Vfs } from "../vfs";

/**
 * HOW MUCH WORK ONE AGENT MAY HAVE OUT AT ONCE, counted on the CALLER's side.
 *
 * Each board already refuses a 21st running mission (`missions-start.ts`), and
 * that is the wrong subject on its own: a caller that spreads its starts over
 * fifty agents never trips any single board's cap while putting a thousand
 * missions in flight. The subject that has to be capped is the CALLER, so this
 * ledger records what one agent started and refuses the next start once it is
 * already running this many.
 *
 * The count is deliberately per AGENT rather than per turn: a loop that starts
 * work, ends its turn and starts more on the next one is the same runaway.
 */
export const MAX_AGENT_STARTED_MISSIONS = 20;

/**
 * How long a CROSS-POD start holds its caller's slot without further evidence.
 *
 * A local start is reconciled exactly - the caller's host owns the target board
 * and re-reads the row's status below. A start in another pod is not: the
 * target never reports back, so the caller would either hold the slot forever
 * (one afternoon of legitimate delegation and the agent can never start work
 * again) or not count it at all. This is the bound in between: long enough that
 * a burst is still fully counted while it happens, short enough that finished
 * work stops being charged for.
 */
const REMOTE_HOLD_MS = 60 * 60 * 1000;

interface StartedMission {
  readonly missionId: string;
  /** The target board's vfs root, or null when it lives in another pod. */
  readonly boardRoot: string | null;
  readonly startedAt: number;
}

class MissionFanout {
  private readonly started = new Map<string, StartedMission[]>();

  /**
   * How many missions this agent still has running, after dropping the ones it
   * can prove are finished. Local rows are re-read; remote ones age out.
   */
  async running(callerAgentId: string, vfs: Vfs, now = Date.now()) {
    const entries = this.started.get(callerAgentId);
    if (!entries?.length) return 0;
    const live: StartedMission[] = [];
    for (const entry of entries) {
      if (entry.boardRoot === null) {
        if (now - entry.startedAt < REMOTE_HOLD_MS) live.push(entry);
        continue;
      }
      const { items } = await loadActivities(vfs, entry.boardRoot);
      const row = items.find((a) => a.id === entry.missionId);
      if (row?.status === "running") live.push(entry);
    }
    if (live.length) this.started.set(callerAgentId, live);
    else this.started.delete(callerAgentId);
    return live.length;
  }

  /** Charge one started mission to its caller. */
  record(
    callerAgentId: string,
    mission: { missionId: string; boardRoot: string | null },
    now = Date.now(),
  ): void {
    const entries = this.started.get(callerAgentId) ?? [];
    entries.push({ ...mission, startedAt: now });
    this.started.set(callerAgentId, entries);
  }

  /** Release a slot a start reserved and then failed to use. */
  release(callerAgentId: string, missionId: string): void {
    const entries = this.started.get(callerAgentId);
    if (!entries) return;
    const left = entries.filter((e) => e.missionId !== missionId);
    if (left.length) this.started.set(callerAgentId, left);
    else this.started.delete(callerAgentId);
  }

  /** Drop an agent's ledger - it was renamed or deleted, so the id is dead. */
  forget(callerAgentId: string): void {
    this.started.delete(callerAgentId);
  }
}

/** The host's one ledger, for the same reason `liveTurns` is a singleton. */
export const missionFanout = new MissionFanout();
