/**
 * Counts the turn ends a stream has shown, and wakes whoever waits for the
 * next one. A waiter names the count it saw BEFORE its send went out, so an
 * end that lands while the send is still in flight is never missed.
 */
export class TurnEndCounter {
  private n = 0;
  private readonly waiters = new Set<() => void>();

  get count(): number {
    return this.n;
  }

  bump(): void {
    this.n++;
    for (const wake of Array.from(this.waiters)) wake();
  }

  /** Resolves once the count exceeds `mark`, or `signal` aborts. */
  after(mark: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.waiters.delete(check);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const check = () => {
        if (this.n > mark) done();
      };
      if (this.n > mark || signal.aborted) return resolve();
      this.waiters.add(check);
      signal.addEventListener("abort", done, { once: true });
    });
  }
}
