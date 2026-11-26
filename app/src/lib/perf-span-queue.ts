import type {
  PerfSpanName,
  PerfSpanObservation,
  PerfSpanTransport,
} from "./perf-span-types";

const FLUSH_DELAY_MS = 5_000;

/** The batch bound for the gateway ingest, flushed a few seconds after a push. */
export class SpanQueue {
  private queue: PerfSpanObservation[] = [];
  private transport: PerfSpanTransport | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  configure(transport: PerfSpanTransport): void {
    this.transport = transport;
    if (this.queue.length > 0) this.scheduleFlush();
  }

  push(span: PerfSpanName, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.queue.push({ span, ms: Math.round(ms) });
    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.transport || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    // Mirror-only build (no ingest URL baked): drop the batch rather than let
    // it accumulate for a transport that will never exist.
    if (!this.transport.send) return;
    try {
      await this.transport.send(batch);
    } catch {
      // Re-queue once so a transient network blip isn't a lost sample; a
      // second failure drops the batch (metrics are best-effort, never noise).
      if (batch.length + this.queue.length <= 40) this.queue.unshift(...batch);
    }
  }

  private scheduleFlush(): void {
    if (!this.transport || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
    // Never keep the process alive for a metrics flush (tests, shutdown).
    (this.flushTimer as { unref?: () => void }).unref?.();
  }
}
