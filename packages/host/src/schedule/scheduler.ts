import { dueAt, getPreference, loadRoutines } from "@houston/domain";
import type { Routine } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { reconcileAgentRuns } from "./reconcile";
import { fireRoutineRun, RoutineBusyError } from "./run";

/** A due routine to run, with its resolved conversation + run id. */
export interface FiringJob {
  workspace: Workspace;
  agent: Agent;
  routine: Routine;
  conversationId: string;
  runId: string;
}

/**
 * Runs a due routine's prompt as a turn. Deployment-specific (the firing path
 * differs cloud vs local), injected into the driver. `fire` resolves once the
 * turn is ACCEPTED, not when it completes — the run's running→surfaced/silent
 * transition is driven by turn completion (wired with the firer in 3.4b).
 */
export interface RoutineFirer {
  fire(job: FiringJob): Promise<void>;
}

/** The dedup primitive the scheduler needs from the bus (atomic set-if-absent). */
export interface FireLock {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

export interface SchedulerDeps {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  /** Cross-replica dedup so a routine fires once per scheduled instant. */
  lock: FireLock;
  firer: RoutineFirer;
  events?: EventHub;
  /** Scan cadence. Default 30s. */
  intervalMs?: number;
  /** Dedup-lock TTL (s); must exceed the scan interval. Default 1h. */
  dedupTtlSec?: number;
  now?: () => Date;
  newId?: () => string;
}

/**
 * The host scheduler: every tick it scans all agents, finds routines that came
 * due since the previous tick, and fires each exactly once. Multi-replica safe
 * by construction — the due instant is the cron time (replica-independent), so
 * a per-(routine, instant) `setNx` lock lets only one replica fire. No leader
 * election; every replica scans, the lock arbitrates.
 *
 * Deployment-agnostic: cloud and local inject their own RoutineFirer + lock
 * (Redis vs in-process). lastTick resets to `now` on start, so a freshly
 * started replica never replays history.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick: Date;
  private readonly intervalMs: number;
  private readonly dedupTtlSec: number;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: SchedulerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.intervalMs = deps.intervalMs ?? 30_000;
    this.dedupTtlSec = deps.dedupTtlSec ?? 3600;
    this.lastTick = this.now();
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = this.now();
    this.timer = setInterval(() => {
      void this.tick(this.now()).catch((err) =>
        console.error(
          "[scheduler] tick failed:",
          err instanceof Error ? err.message : err,
        ),
      );
    }, this.intervalMs);
    // The scheduler must not keep the process alive on its own.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** One scan of every agent's routines for the window (lastTick, now]. Exposed for tests. */
  async tick(now: Date): Promise<void> {
    const since = this.lastTick;
    this.lastTick = now;

    for (const ws of await this.deps.store.listWorkspaces()) {
      // One account-wide zone governs every routine in the workspace (HOU-470:
      // no per-routine override). Re-read it each tick, so when the preference
      // changes the next scan re-times every routine — the cloud analog of the
      // Rust scheduler's respawn-on-tz-change.
      const timezone = await getPreference(this.deps.vfs, ws.id, "timezone");
      for (const agent of await this.deps.store.listAgents(ws.id)) {
        const root = this.deps.paths.agentRoot(ws, agent);
        const { items: routines } = await loadRoutines(this.deps.vfs, root);
        for (const routine of routines) {
          const at = dueAt(routine, since, now, timezone);
          if (!at) continue;
          // The instant is replica-independent → all replicas race for one key.
          const won = await this.deps.lock.setNx(
            `routine:fired:${routine.id}:${at.toISOString()}`,
            "1",
            this.dedupTtlSec,
          );
          if (won) await this.fireRoutine(ws, agent, routine);
        }
        // Complete runs whose turn has finished (silent/surfaced/timeout).
        await reconcileAgentRuns(
          {
            vfs: this.deps.vfs,
            paths: this.deps.paths,
            lock: this.deps.lock,
            events: this.deps.events,
            now: this.now,
            newId: this.newId,
          },
          ws,
          agent,
        );
      }
    }
  }

  /**
   * Record + fire one due routine. Shares `fireRoutineRun` with the on-demand
   * "run now" route, so a scheduled run and a hand-pressed one are identical
   * (same record, same firer, same errored-on-fail bookkeeping). The helper
   * rethrows a fire failure; here — the background scan, with no UI thread to
   * toast on — we log it (the one sanctioned `console.error` boundary).
   */
  private async fireRoutine(
    ws: Workspace,
    agent: Agent,
    routine: Routine,
  ): Promise<void> {
    try {
      await fireRoutineRun(
        {
          vfs: this.deps.vfs,
          paths: this.deps.paths,
          firer: this.deps.firer,
          events: this.deps.events,
          now: this.now,
          newId: this.newId,
        },
        ws,
        agent,
        routine,
      );
    } catch (err) {
      // Expected when the previous run is still in flight — the instant is
      // skipped (its dedup lock is already burned), not an error.
      if (err instanceof RoutineBusyError) return;
      console.error(
        `[scheduler] routine ${routine.id} fire failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
