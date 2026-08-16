/** Process-local admission guard for bounded pooled-turn concurrency. */
export class AdmissionLimiter {
  private active = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("turn concurrency must be a positive integer");
    }
  }

  /** Acquire a slot, returning an idempotent release function when available. */
  tryAcquire(): (() => void) | null {
    if (this.active >= this.capacity) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
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
