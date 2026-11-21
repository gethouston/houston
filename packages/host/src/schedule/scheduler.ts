import { getPreference, resolveTimezone } from "@houston/domain";
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

export const EXTERNAL_FIRE_GRACE_MS = 120_000;

export interface SchedulerDeps {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  lock: FireLock;
  firer: RoutineFirer;
  events?: EventHub;
  intervalMs?: number;
  dedupTtlSec?: number;
  mode?: RoutineSchedulerMode;
  cronFireGraceMs?: number;
  now?: () => Date;
  newId?: () => string;
  replyReader?: ReconcileDeps["replyReader"];
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick: Date;
  private startedAt: Date;
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
    this.startedAt = this.lastTick;
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = this.now();
    this.startedAt = this.lastTick;
    this.timer = setInterval(() => {
      void this.tick(this.now()).catch((err) =>
        console.error(
          "[scheduler] tick failed:",
          err instanceof Error ? err.message : err,
        ),
      );
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

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
    const grace = this.deps.cronFireGraceMs ?? 0;
    const evalSince = grace
      ? new Date(Math.max(since.getTime() - grace, this.startedAt.getTime()))
      : since;
    const evalNow = grace ? new Date(now.getTime() - grace) : now;
    for (const ws of workspaces) {
      await this.scanWorkspace(ws, evalSince, evalNow);
    }
  }

  private async scanWorkspace(
    ws: Workspace,
    since: Date,
    now: Date,
  ): Promise<void> {
    try {
      const timezone = resolveTimezone(
        await getPreference(this.deps.vfs, ws.id, "timezone"),
      );
      const agents = await this.deps.store.listAgents(ws.id);
      for (const agent of agents) {
        await scanAgent(
          {
            ...this.deps,
            now: this.now,
            newId: this.newId,
            dedupTtlSec: this.dedupTtlSec,
            cronFiresEnabled: this.deps.mode !== "external",
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
