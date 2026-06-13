import type { Routine } from "@houston/protocol";
import {
  createRoutineRun,
  dueAt,
  loadRoutineRuns,
  loadRoutines,
  saveRoutineRuns,
} from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { WorkspacePaths } from "../paths";
import type { EventHub } from "../events/hub";
import { reconcileAgentRuns } from "./reconcile";

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
        console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err),
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
      for (const agent of await this.deps.store.listAgents(ws.id)) {
        const root = this.deps.paths.agentRoot(ws, agent);
        const { items: routines } = await loadRoutines(this.deps.vfs, root);
        for (const routine of routines) {
          const at = dueAt(routine, since, now);
          if (!at) continue;
          // The instant is replica-independent → all replicas race for one key.
          const won = await this.deps.lock.setNx(
            `routine:fired:${routine.id}:${at.toISOString()}`,
            "1",
            this.dedupTtlSec,
          );
          if (won) await this.fireRoutine(ws, agent, routine, root, now);
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

  private async fireRoutine(
    ws: Workspace,
    agent: Agent,
    routine: Routine,
    root: string,
    now: Date,
  ): Promise<void> {
    const runId = this.newId();
    const run = createRoutineRun(routine, runId, now.toISOString());
    const { items } = await loadRoutineRuns(this.deps.vfs, root);
    await saveRoutineRuns(this.deps.vfs, root, [run, ...items]); // newest first
    this.deps.events?.emit(ws.ownerUserId, { type: "RoutineRunsChanged", agentPath: agent.id });

    try {
      await this.deps.firer.fire({ workspace: ws, agent, routine, conversationId: run.session_key, runId });
    } catch (err) {
      // The turn couldn't even be started. Mark the run errored so it never hangs
      // in "running"; a background loop has no UI to toast, so we also log.
      const message = err instanceof Error ? err.message : String(err);
      const { items: current } = await loadRoutineRuns(this.deps.vfs, root);
      await saveRoutineRuns(
        this.deps.vfs,
        root,
        current.map((r) =>
          r.id === runId
            ? { ...r, status: "error" as const, summary: message, completed_at: this.now().toISOString() }
            : r,
        ),
      );
      this.deps.events?.emit(ws.ownerUserId, { type: "RoutineRunsChanged", agentPath: agent.id });
      console.error(`[scheduler] routine ${routine.id} fire failed:`, message);
    }
  }
}
