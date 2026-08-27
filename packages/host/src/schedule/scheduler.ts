import { getPreference } from "@houston/domain";
import type { Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { type RoutineFirer, scanAgent } from "./agent-scan";
import type { FireLock } from "./fire-lock";
import type { ReconcileDeps } from "./reconcile";

export type { FiringJob, RoutineFirer } from "./agent-scan";
export type { FireLock } from "./fire-lock";

export type RoutineSchedulerMode = "local" | "external";

/**
 * How long a local cron scan waits past a due instant before firing it, where
 * an external fire delivery also runs (managed cloud). The control plane's
 * delivery carries the routine creator's minted acting identity, so its turn
 * resolves the creator's own credentials; the pod-local path can only run on
 * the shared team scope (pods cannot mint identity — HOU-976 D10), where a
 * member's personally-connected provider reads as "not connected". Racing the
 * delivery at second granularity made WHICH credentials a run used depend on
 * scheduler load: at the top of the hour the delivery lags behind the herd of
 * due routines, the local scan won the per-instant dedup burn, and the run
 * failed no_provider (PRODUCT-1549). The grace keeps the local cron as a
 * genuine backstop: it fires only instants the external delivery has left
 * unclaimed for this long. Must stay well under the dedup TTL and above the
 * delivery's worst observed top-of-hour lag (~15s).
 */
export const EXTERNAL_FIRE_GRACE_MS = 120_000;

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
  /** `external` disables cron fires only. Default `local`. */
  mode?: RoutineSchedulerMode;
  /** Backstop delay for cron fires (see EXTERNAL_FIRE_GRACE_MS). Default 0. */
  cronFireGraceMs?: number;
  now?: () => Date;
  newId?: () => string;
  replyReader?: ReconcileDeps["replyReader"];
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
 *
 * The sweep is fail-isolated at every level (HOU-953): a workspace or agent
 * that throws is logged and skipped, never allowed to abort the tick. `lastTick`
 * has already advanced by then, so an escaping throw would drop that window's
 * instants for every agent behind it — permanently, and silently.
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

    let workspaces: Workspace[];
    try {
      workspaces = await this.deps.store.listWorkspaces();
    } catch (err) {
      console.error("[scheduler] workspace listing failed:", reason(err));
      return;
    }
    for (const ws of workspaces) {
      await this.scanWorkspace(ws, since, now);
    }
  }

  /**
   * One workspace's scan. Its timezone read and agent listing are shared by
   * every agent below it, so a failure here skips this workspace only — the
   * others still fire.
   */
  private async scanWorkspace(
    ws: Workspace,
    since: Date,
    now: Date,
  ): Promise<void> {
    try {
      // One account-wide zone governs every routine in the workspace (HOU-470:
      // no per-routine override). Re-read it each tick, so when the preference
      // changes the next scan re-times every routine.
      const timezone = await getPreference(this.deps.vfs, ws.id, "timezone");
      const agents = await this.deps.store.listAgents(ws.id);
      for (const agent of agents) {
        await scanAgent(
          {
            ...this.deps,
            now: this.now,
            newId: this.newId,
            dedupTtlSec: this.dedupTtlSec,
            cronFiresEnabled: this.deps.mode !== "external",
            cronFireGraceMs: this.deps.cronFireGraceMs ?? 0,
          },
          ws,
          agent,
          timezone,
          since,
          now,
        );
      }
    } catch (err) {
      console.error(`[scheduler] workspace ${ws.id} scan failed:`, reason(err));
    }
  }
}

const reason = (err: unknown) =>
  err instanceof Error ? err.message : String(err);
