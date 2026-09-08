import { isBridgeAbort } from "./errors";
export class BridgeLifetime {
  abort = new AbortController();
  epoch = 0;
  timer?: ReturnType<typeof setTimeout>;
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly report: (error: unknown) => void) {}
  invalidate() {
    this.epoch++;
    this.abort.abort();
    this.abort = new AbortController();
    clearTimeout(this.timer);
    this.timer = undefined;
    return this.epoch;
  }
  enqueue(task: () => Promise<void>) {
    const next = this.tail.then(task);
    this.tail = next.catch((error) => {
      if (!isBridgeAbort(error)) this.report(error);
    });
    return next;
  }
}
