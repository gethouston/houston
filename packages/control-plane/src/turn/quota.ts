/**
 * Per-workspace turn budget (availability Gate #5 at the control-plane tier):
 * one tenant must not be able to hog the turn-runtime fleet. Rolling
 * per-hour count + concurrent cap, keyed by workspace. In-memory, matching
 * the control plane's single-replica deployment.
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

interface WorkspaceUsage {
  inFlight: number;
  starts: number[];
}

export class TurnQuota {
  private usage = new Map<string, WorkspaceUsage>();
  private readonly now: () => number;

  constructor(
    private readonly limits: { maxConcurrent: number; perHour: number },
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** Claim a turn slot or throw TurnQuotaError. Release exactly once (idempotent). */
  acquire(workspaceId: string): () => void {
    const t = this.now();
    const u = this.usage.get(workspaceId) ?? { inFlight: 0, starts: [] };
    u.starts = u.starts.filter((s) => t - s < 3_600_000);
    if (u.inFlight >= this.limits.maxConcurrent || u.starts.length >= this.limits.perHour) {
      throw new TurnQuotaError(this.limits.maxConcurrent, this.limits.perHour);
    }
    u.inFlight++;
    u.starts.push(t);
    this.usage.set(workspaceId, u);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      u.inFlight--;
    };
  }
}
