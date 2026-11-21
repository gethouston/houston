export class CoalescedRun {
  private running: Promise<void> | undefined;
  private rerun = false;

  constructor(
    private readonly pass: () => Promise<void>,
    private readonly mayRerun: () => boolean,
  ) {}

  get inFlight(): Promise<void> | undefined {
    return this.running;
  }

  cancelRerun(): void {
    this.rerun = false;
  }

  request(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.pass();
      } while (this.rerun && this.mayRerun());
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
}
