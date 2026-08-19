/** Process-local admission guard for bounded pooled-turn concurrency. */
export class AdmissionLimiter {
  private activeCount = 0;

  constructor(private readonly capacityValue: number) {
    if (!Number.isInteger(capacityValue) || capacityValue < 1) {
      throw new Error("turn concurrency must be a positive integer");
    }
  }

  /** Maximum simultaneous turns this worker admits. */
  get capacity(): number {
    return this.capacityValue;
  }

  /** Turns currently holding an admission slot. */
  get active(): number {
    return this.activeCount;
  }

  /** Acquire a slot, returning an idempotent release function when available. */
  tryAcquire(): (() => void) | null {
    if (this.activeCount >= this.capacityValue) return null;
    this.activeCount += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount -= 1;
    };
  }
}

/** Parse the configured turn capacity, defaulting to one. */
export function turnConcurrency(value = process.env.HOUSTON_TURN_CONCURRENCY) {
  if (value === undefined || value === "") return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("HOUSTON_TURN_CONCURRENCY must be a positive integer");
  }
  return parsed;
}
