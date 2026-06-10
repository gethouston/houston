/**
 * Per-workspace budget for `run_code` (security Gate #5: availability).
 *
 * One runtime serves one workspace, so an in-process limiter IS the
 * per-workspace limit. Without it, a single prompt-injected (or just
 * enthusiastic) agent can saturate the shared sandbox fleet's max-instances
 * and starve every other tenant. The sandbox side caps the fleet globally;
 * this caps what one workspace may take of it.
 */

export class RunCodeLimitError extends Error {
  constructor(maxConcurrent: number, maxPerMinute: number) {
    super(
      `This workspace is over its code-execution budget ` +
        `(max ${maxConcurrent} runs at once, ${maxPerMinute} per minute). ` +
        `Wait a moment and try again.`,
    );
    this.name = "RunCodeLimitError";
  }
}

export interface RunCodeLimits {
  maxConcurrent: number;
  maxPerMinute: number;
}

export class RunCodeLimiter {
  private inFlight = 0;
  private starts: number[] = [];
  private readonly now: () => number;

  constructor(
    private readonly limits: RunCodeLimits,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /**
   * Claim one run slot or throw RunCodeLimitError. The returned release MUST
   * be called exactly once (callers use try/finally); calling it again is a
   * no-op rather than a budget leak.
   */
  acquire(): () => void {
    const t = this.now();
    this.starts = this.starts.filter((s) => t - s < 60_000);
    if (this.inFlight >= this.limits.maxConcurrent || this.starts.length >= this.limits.maxPerMinute) {
      throw new RunCodeLimitError(this.limits.maxConcurrent, this.limits.maxPerMinute);
    }
    this.inFlight++;
    this.starts.push(t);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight--;
    };
  }
}
