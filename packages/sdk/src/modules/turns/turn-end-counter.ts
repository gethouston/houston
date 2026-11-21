export class TurnEndCounter {
  private n = 0;
  private readonly waiters = new Set<() => void>();

  get count(): number {
    return this.n;
  }

  bump(): void {
    this.n++;
    for (const wake of [...this.waiters]) wake();
  }

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
