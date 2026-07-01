import { MemoryTurnBus, type TurnBus } from "./bus";

/**
 * Per-workspace turn budget (availability Gate #5 at the control-plane tier):
 * one tenant must not be able to hog the turn-runtime fleet. Concurrent cap +
 * per-hour count, keyed by workspace. Counters live on the TurnBus so the cap
 * holds across control-plane replicas; the hourly window is a fixed UTC-hour
 * bucket (the bus gives atomic counters, not sorted sets — bucket precision is
 * plenty for an abuse cap).
 */

export class TurnQuotaError extends Error {
  constructor(maxConcurrent: number, perHour: number) {
    super(
      `This workspace is over its turn budget (max ${maxConcurrent} at once, ` +
        `${perHour} per hour). Wait a moment and try again.`,
    );
    this.name = "TurnQuotaError";
  }
}

const concurrentKey = (ws: string) => `quota:c:${ws}`;
const hourKey = (ws: string, bucket: number) => `quota:h:${ws}:${bucket}`;

export class TurnQuota {
  private readonly bus: TurnBus;
  private readonly now: () => number;

  constructor(
    private readonly limits: { maxConcurrent: number; perHour: number },
    opts: { bus?: TurnBus; now?: () => number } = {},
  ) {
    this.bus = opts.bus ?? new MemoryTurnBus(opts.now);
    this.now = opts.now ?? Date.now;
  }

  /** Claim a turn slot or throw TurnQuotaError. Release exactly once (idempotent). */
  async acquire(workspaceId: string): Promise<() => Promise<void>> {
    const cKey = concurrentKey(workspaceId);
    // The concurrent counter's TTL is a leak guard only — releases decrement it
    // long before; a stuck counter self-heals within the hour.
    const inFlight = await this.bus.incr(cKey, 3_600);
    if (inFlight > this.limits.maxConcurrent) {
      await this.bus.decr(cKey);
      throw new TurnQuotaError(this.limits.maxConcurrent, this.limits.perHour);
    }
    const hKey = hourKey(workspaceId, Math.floor(this.now() / 3_600_000));
    const started = await this.bus.incr(hKey, 7_200);
    if (started > this.limits.perHour) {
      // Rejected attempts don't consume the hourly budget (matches the old
      // rolling-window behavior).
      await this.bus.decr(hKey);
      await this.bus.decr(cKey);
      throw new TurnQuotaError(this.limits.maxConcurrent, this.limits.perHour);
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await this.bus.decr(cKey);
    };
  }
}
