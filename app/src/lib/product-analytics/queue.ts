import type { AnalyticsEventName } from "../analytics-vocabulary.ts";
import type { PendingEvent } from "./backlog.ts";
import { ProductAnalyticsBacklog, toWireEvent } from "./backlog.ts";
import { isProductEvent, pickProductProps } from "./catalogue.ts";
import {
  defaultSchedule,
  FLUSH_AT_QUEUED,
  FLUSH_DELAY_MS,
  type FlushScheduler,
  MAX_ATTEMPTS,
  MAX_BATCH,
  nextHoldDelay,
} from "./flush-policy.ts";
import type {
  ProductAnalyticsEvent,
  ProductAnalyticsSendOptions,
  ProductAnalyticsSendResult,
} from "./wire.ts";

export type ProductAnalyticsLoss = "rejected" | "overflow" | "unexpected";

export interface ProductAnalyticsQueueDeps {
  transport(
    events: readonly ProductAnalyticsEvent[],
    options: ProductAnalyticsSendOptions,
  ): Promise<ProductAnalyticsSendResult>;
  onLost?(reason: ProductAnalyticsLoss, detail: unknown): void;
  now?(): number;
  uuid?(): string;
  schedule?: FlushScheduler;
}

export class ProductAnalyticsQueue {
  private readonly deps: ProductAnalyticsQueueDeps;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly schedule: FlushScheduler;
  private readonly backlog: ProductAnalyticsBacklog;
  private cancelScheduled: (() => void) | null = null;
  private inFlight = false;
  private flushRequested = false;
  private finalRequested = false;
  private holdDelayMs = 0;

  constructor(deps: ProductAnalyticsQueueDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.uuid = deps.uuid ?? (() => crypto.randomUUID());
    this.schedule = deps.schedule ?? defaultSchedule;
    this.backlog = new ProductAnalyticsBacklog((count) => {
      this.deps.onLost?.("overflow", { count });
    });
  }

  get size(): number {
    return this.backlog.size;
  }

  private get held(): boolean {
    return this.holdDelayMs > 0;
  }

  enqueue(name: AnalyticsEventName, props?: Record<string, unknown>): void {
    if (!isProductEvent(name)) return;
    this.backlog.add({
      id: this.uuid(),
      name,
      ts: new Date(this.now()).toISOString(),
      properties: pickProductProps(name, props),
      attempts: 0,
    });
    if (this.inFlight || this.held) return;
    if (this.backlog.size >= FLUSH_AT_QUEUED) void this.flush();
    else this.scheduleFlush();
  }

  async flush(options: { final?: boolean } = {}): Promise<void> {
    const final = options.final === true;
    if (this.inFlight) {
      this.flushRequested = true;
      this.finalRequested ||= final;
      return;
    }
    this.unschedule();
    if (this.backlog.size === 0) {
      this.holdDelayMs = 0;
      return;
    }
    const batch = this.backlog.take(MAX_BATCH);
    this.inFlight = true;
    let result: ProductAnalyticsSendResult;
    try {
      result = await this.deps.transport(batch.map(toWireEvent), { final });
    } catch (error) {
      this.deps.onLost?.("unexpected", error);
      result = { status: "failed" };
    } finally {
      this.inFlight = false;
    }
    this.settle(batch, result);
    if (!this.flushRequested) return;
    this.flushRequested = false;
    const nextFinal = this.finalRequested;
    this.finalRequested = false;
    await this.flush({ final: nextFinal });
  }

  clear(): void {
    this.unschedule();
    this.backlog.clear();
    this.holdDelayMs = 0;
    this.flushRequested = false;
    this.finalRequested = false;
  }

  private settle(
    batch: PendingEvent[],
    result: ProductAnalyticsSendResult,
  ): void {
    if (result.status === "no-session") {
      this.backlog.putBack(batch);
      this.holdDelayMs = nextHoldDelay(this.holdDelayMs);
      this.scheduleFlush(this.holdDelayMs);
      return;
    }
    this.holdDelayMs = 0;
    if (result.status === "failed") {
      for (const event of batch) event.attempts += 1;
      this.backlog.putBack(batch.filter((e) => e.attempts < MAX_ATTEMPTS));
      if (this.backlog.size > 0) this.scheduleFlush();
      return;
    }
    if (result.rejected?.length)
      this.deps.onLost?.("rejected", result.rejected);
    if (this.backlog.size > 0) this.scheduleFlush();
  }

  private scheduleFlush(ms: number = FLUSH_DELAY_MS): void {
    if (this.cancelScheduled) return;
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = null;
      void this.flush();
    }, ms);
  }

  private unschedule(): void {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }
}
