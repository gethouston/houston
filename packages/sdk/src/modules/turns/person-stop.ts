export class PersonStop {
  private pending = 0;
  private settle: (() => void) | undefined;
  private closed = false;
  private resolveSettled: () => void = () => {};
  private readonly settled = new Promise<void>((r) => {
    this.resolveSettled = r;
  });

  join(): (() => void) | null {
    if (this.closed) return null;
    this.pending++;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.pending--;
      this.maybeSettle();
    };
  }

  settleWith(settle: () => void): Promise<void> {
    this.settle = settle;
    this.maybeSettle();
    return this.settled;
  }

  private maybeSettle(): void {
    if (this.closed || this.pending > 0 || !this.settle) return;
    this.closed = true;
    this.settle();
    this.resolveSettled();
  }
}
