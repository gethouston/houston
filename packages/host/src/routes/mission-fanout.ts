import { loadActivities } from "@houston/domain";
import type { Vfs } from "../vfs";
import type { RemoteMissionStatus } from "./mission-fanout-remote-status";

export { readRemoteMissionStatus } from "./mission-fanout-remote-status";

export const MAX_AGENT_STARTED_MISSIONS = 20;

const REMOTE_HOLD_MS = 60 * 60 * 1000;
const REMOTE_FAILURE_CEILING_MS = 24 * 60 * 60 * 1000;
const REMOTE_CHECK_CACHE_MS = 30_000;
const REMOTE_FAILURE_CACHE_MS = 60_000;
const RECONCILE_BATCH_SIZE = 4;

interface StartedMission {
  readonly missionId: string;
  readonly boardRoot: string | null;
  readonly startedAt: number;
  readonly readStatus?: (actingAs?: string) => Promise<RemoteMissionStatus>;
  checkedAt?: number;
  failedAt?: number;
}

class MissionFanout {
  private readonly started = new Map<string, StartedMission[]>();
  private readonly pending = new Map<string, number>();
  private readonly locks = new Map<string, Promise<void>>();

  private async locked<T>(
    callerAgentId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(callerAgentId);
    let unlock: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    this.locks.set(callerAgentId, gate);
    if (previous) await previous;
    try {
      return await run();
    } finally {
      if (this.locks.get(callerAgentId) === gate)
        this.locks.delete(callerAgentId);
      unlock();
    }
  }

  async reserve(
    callerAgentId: string,
    vfs: Vfs,
    actingAs?: string,
  ): Promise<boolean> {
    await this.running(callerAgentId, vfs, Date.now(), actingAs);
    return this.locked(callerAgentId, async () => {
      const running = this.started.get(callerAgentId)?.length ?? 0;
      const pending = this.pending.get(callerAgentId) ?? 0;
      if (running + pending >= MAX_AGENT_STARTED_MISSIONS) return false;
      this.pending.set(callerAgentId, pending + 1);
      return true;
    });
  }

  async recordReserved(
    callerAgentId: string,
    mission: Parameters<MissionFanout["record"]>[1],
  ): Promise<void> {
    await this.locked(callerAgentId, async () => {
      this.dropReservation(callerAgentId);
      this.record(callerAgentId, mission);
    });
  }

  async releaseReservation(callerAgentId: string): Promise<void> {
    await this.locked(callerAgentId, async () => {
      this.dropReservation(callerAgentId);
    });
  }

  private dropReservation(callerAgentId: string): void {
    const pending = this.pending.get(callerAgentId) ?? 0;
    if (pending <= 1) this.pending.delete(callerAgentId);
    else this.pending.set(callerAgentId, pending - 1);
  }

  async running(
    callerAgentId: string,
    vfs: Vfs,
    now = Date.now(),
    actingAs?: string,
  ) {
    const entries = [...(this.started.get(callerAgentId) ?? [])];
    if (!entries?.length) return 0;
    const live = new Set<StartedMission>();
    for (let i = 0; i < entries.length; i += RECONCILE_BATCH_SIZE) {
      const batch = entries.slice(i, i + RECONCILE_BATCH_SIZE);
      const active = await Promise.all(
        batch.map((entry) => this.isActive(entry, vfs, now, actingAs)),
      );
      for (let j = 0; j < batch.length; j++) {
        const entry = batch[j];
        if (active[j] && entry) live.add(entry);
      }
    }
    return this.locked(callerAgentId, async () => {
      const current = this.started.get(callerAgentId) ?? [];
      const kept = current.filter((entry) =>
        entries.includes(entry) ? live.has(entry) : true,
      );
      if (kept.length) this.started.set(callerAgentId, kept);
      else this.started.delete(callerAgentId);
      return kept.length;
    });
  }

  private async isActive(
    entry: StartedMission,
    vfs: Vfs,
    now: number,
    actingAs?: string,
  ): Promise<boolean> {
    if (entry.boardRoot !== null) {
      const { items } = await loadActivities(vfs, entry.boardRoot);
      return items.find((a) => a.id === entry.missionId)?.status === "running";
    }
    if (now - entry.startedAt < REMOTE_HOLD_MS) return true;
    if (
      entry.checkedAt !== undefined &&
      now - entry.startedAt < REMOTE_FAILURE_CEILING_MS &&
      now - entry.checkedAt < REMOTE_CHECK_CACHE_MS
    )
      return true;
    if (
      entry.failedAt !== undefined &&
      now - entry.startedAt < REMOTE_FAILURE_CEILING_MS &&
      now - entry.failedAt < REMOTE_FAILURE_CACHE_MS
    )
      return true;
    entry.checkedAt = now;
    try {
      if (!entry.readStatus) throw new Error("remote status reader missing");
      const status = await entry.readStatus(actingAs);
      if (status === "running") return true;
      return false;
    } catch (error) {
      entry.checkedAt = undefined;
      entry.failedAt = now;
      console.error(
        `[missions] could not reconcile remote mission ${entry.missionId}`,
        error,
      );
      if (now - entry.startedAt < REMOTE_FAILURE_CEILING_MS) return true;
      console.error(
        `[missions] remote mission ${entry.missionId} exceeded the 24 hour unreadable limit`,
        error,
      );
      return false;
    }
  }

  record(
    callerAgentId: string,
    mission: {
      missionId: string;
      boardRoot: string | null;
      readStatus?: (actingAs?: string) => Promise<RemoteMissionStatus>;
    },
    now = Date.now(),
  ): void {
    const entries = this.started.get(callerAgentId) ?? [];
    entries.push({ ...mission, startedAt: now });
    this.started.set(callerAgentId, entries);
  }

  forget(callerAgentId: string): void {
    this.started.delete(callerAgentId);
    this.pending.delete(callerAgentId);
  }
}

export const missionFanout = new MissionFanout();
