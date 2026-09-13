/**
 * The client buffer of the first-party product-analytics pipe: it sits between
 * the in-app analytics bus and the gateway ingest route, keeps what the
 * catalogue allows, and ships it in batches.
 *
 * Pure and dependency-injected end to end (clock, id minting, transport,
 * scheduler) so the whole flush policy is driven by tests with no browser, no
 * network and no wall clock.
 */

import { isProductEvent, pickProductProps } from "./catalogue.ts";
import type {
  ProductAnalyticsEvent,
  ProductAnalyticsSendResult,
} from "./wire.ts";

/** Runs `run` after `ms`; the returned function cancels it. */
export type FlushScheduler = (run: () => void, ms: number) => () => void;

export interface ProductAnalyticsQueueDeps {
  transport(
    events: readonly ProductAnalyticsEvent[],
  ): Promise<ProductAnalyticsSendResult>;
  now?(): number;
  uuid?(): string;
  schedule?: FlushScheduler;
}

/** Long enough to swallow a burst, short enough to survive a quick quit. */
const FLUSH_DELAY_MS = 3_000;
/** A burst this size ships at once instead of waiting out the debounce. */
const FLUSH_AT_QUEUED = 25;
/** Ceiling on a backlog nobody could deliver (offline, signed out). */
const MAX_QUEUED = 200;
/** The route refuses a bigger batch, so a backlog ships in slices. */
const MAX_BATCH = 100;
/** One send, one retry — a second failure drops the batch. */
const MAX_ATTEMPTS = 2;

interface PendingEvent extends ProductAnalyticsEvent {
  attempts: number;
}

const defaultSchedule: FlushScheduler = (run, ms) => {
  const handle = setTimeout(run, ms);
  // Never keep the process alive for an analytics flush (tests, shutdown).
  (handle as { unref?: () => void }).unref?.();
  return () => clearTimeout(handle);
};

export class ProductAnalyticsQueue {
  private readonly deps: ProductAnalyticsQueueDeps;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly schedule: FlushScheduler;
  private pending: PendingEvent[] = [];
  private cancelScheduled: (() => void) | null = null;
  private inFlight = false;
  private droppedCount = 0;

  constructor(deps: ProductAnalyticsQueueDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.uuid = deps.uuid ?? (() => crypto.randomUUID());
    this.schedule = deps.schedule ?? defaultSchedule;
  }

  /** Events waiting to be shipped. */
  get size(): number {
    return this.pending.length;
  }

  /** Events the cap threw away — a backlog nobody could deliver. */
  get dropped(): number {
    return this.droppedCount;
  }

  /** Buffers one tracked event. Anything outside the catalogue is ignored. */
  enqueue(name: string, props?: Record<string, unknown>): void {
    if (!isProductEvent(name)) return;
    this.pending.push({
      id: this.uuid(),
      name,
      ts: new Date(this.now()).toISOString(),
      properties: pickProductProps(name, props),
      attempts: 0,
    });
    this.trim();
    if (this.pending.length >= FLUSH_AT_QUEUED) void this.flush();
    else this.scheduleFlush();
  }

  /** Ship what is queued now (a burst, a goodbye, a session arriving). */
  async flush(): Promise<void> {
    this.unschedule();
    if (this.inFlight || this.pending.length === 0) return;
    const batch = this.pending.splice(0, MAX_BATCH);
    this.inFlight = true;
    let result: ProductAnalyticsSendResult;
    try {
      result = await this.deps.transport(batch.map(toWireEvent));
    } catch {
      result = { status: "failed" };
    } finally {
      this.inFlight = false;
    }
    this.settle(batch, result);
  }

  /** Forget everything queued (a deployment with nowhere to ship to). */
  clear(): void {
    this.unschedule();
    this.pending = [];
  }

  private settle(
    batch: PendingEvent[],
    result: ProductAnalyticsSendResult,
  ): void {
    if (result.status === "no-session") {
      // Signed out is a lifecycle state, not a failure: the batch keeps its
      // attempts and waits for a bearer (the sink re-flushes when one lands).
      this.requeue(batch);
      return;
    }
    if (result.status === "failed") {
      for (const event of batch) event.attempts += 1;
      this.requeue(batch.filter((e) => e.attempts < MAX_ATTEMPTS));
      if (this.pending.length > 0) this.scheduleFlush();
      return;
    }
    if (result.rejected?.length) {
      // The gateway refused these by name/shape — resending changes nothing,
      // so they are reported to whoever is reading the console and dropped.
      console.warn("[product-analytics] events rejected", result.rejected);
    }
    if (this.pending.length > 0) this.scheduleFlush();
  }

  private requeue(batch: PendingEvent[]): void {
    if (batch.length === 0) return;
    this.pending.unshift(...batch);
    this.trim();
  }

  private trim(): void {
    const excess = this.pending.length - MAX_QUEUED;
    if (excess <= 0) return;
    this.pending.splice(0, excess);
    this.droppedCount += excess;
  }

  private scheduleFlush(): void {
    if (this.cancelScheduled) return;
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
  }

  private unschedule(): void {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }
}

/** Drops the delivery bookkeeping: the route refuses unknown fields. */
function toWireEvent(event: PendingEvent): ProductAnalyticsEvent {
  return {
    id: event.id,
    name: event.name,
    ts: event.ts,
    properties: event.properties,
  };
}
