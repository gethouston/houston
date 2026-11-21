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

  acquire(): () => void {
    const t = this.now();
    this.starts = this.starts.filter((s) => t - s < 60_000);
    if (
      this.inFlight >= this.limits.maxConcurrent ||
      this.starts.length >= this.limits.maxPerMinute
    ) {
      throw new RunCodeLimitError(
        this.limits.maxConcurrent,
        this.limits.maxPerMinute,
      );
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
