export class AdmissionLimiter {
  private activeCount = 0;

  constructor(private readonly capacityValue: number) {
    if (!Number.isInteger(capacityValue) || capacityValue < 1) {
      throw new Error("turn concurrency must be a positive integer");
    }
  }

  get capacity(): number {
    return this.capacityValue;
  }

  get active(): number {
    return this.activeCount;
  }

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

export function turnConcurrency(value = process.env.HOUSTON_TURN_CONCURRENCY) {
  if (value === undefined || value === "") return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("HOUSTON_TURN_CONCURRENCY must be a positive integer");
  }
  return parsed;
}
