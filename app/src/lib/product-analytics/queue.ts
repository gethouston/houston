/**
 * The client buffer of the first-party product-analytics pipe: it sits between
 * the in-app analytics bus and the gateway ingest route, keeps what the
 * catalogue allows, and ships it in batches. The backlog it holds while nothing
 * can be delivered is `backlog.ts`.
 *
 * Pure and dependency-injected end to end (clock, id minting, transport,
 * scheduler, loss reporting) so the whole flush policy is driven by tests with
 * no browser, no network and no wall clock.
 */

import type { AnalyticsEventName } from "../analytics-vocabulary.ts";
import type { PendingEvent } from "./backlog.ts";
import { ProductAnalyticsBacklog, toWireEvent } from "./backlog.ts";
import { isProductEvent, pickProductProps } from "./catalogue.ts";
import type {
  ProductAnalyticsEvent,
  ProductAnalyticsSendResult,
} from "./wire.ts";

/** Runs `run` after `ms`; the returned function cancels it. */
export type FlushScheduler = (run: () => void, ms: number) => () => void;

/**
 * Why events left the pipe without ever being stored: the gateway refused them
 * by name or shape (this client and the route disagree, which resending cannot
 * fix), the cap threw part of a backlog away, or the transport threw instead of
 * answering with a result.
 */
export type ProductAnalyticsLoss = "rejected" | "overflow" | "unexpected";

export interface ProductAnalyticsQueueDeps {
  transport(
    events: readonly ProductAnalyticsEvent[],
  ): Promise<ProductAnalyticsSendResult>;
  /** Where lost events are reported. Analytics is silent to the user and never
   *  silent to us; the hook wires this to `reportError`. */
  onLost?(reason: ProductAnalyticsLoss, detail: unknown): void;
  now?(): number;
  uuid?(): string;
  schedule?: FlushScheduler;
}

/** Long enough to swallow a burst, short enough to survive a quick quit. */
const FLUSH_DELAY_MS = 3_000;
/** A burst this size ships at once instead of waiting out the debounce. */
const FLUSH_AT_QUEUED = 25;
/** The route refuses a bigger batch, so a backlog ships in slices. */
const MAX_BATCH = 100;
/** One send, one retry — a second failure drops the batch. */
const MAX_ATTEMPTS = 2;
/** Ceiling on the held re-poll: a signed-out app must not poll at the debounce
 *  rate forever, and a session arriving is never more than a minute away. */
const MAX_HOLD_DELAY_MS = 60_000;

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
  private readonly backlog: ProductAnalyticsBacklog;
  private cancelScheduled: (() => void) | null = null;
  private inFlight = false;
  private flushRequested = false;
  /** How long the next held re-poll waits; 0 when the pipe is not held. */
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

  /** Events waiting to be shipped. */
  get size(): number {
    return this.backlog.size;
  }

  /** Whether the last attempt found no session, so the pipe is waiting. */
  private get held(): boolean {
    return this.holdDelayMs > 0;
  }

  /** Buffers one tracked event. Anything outside the catalogue is ignored. */
  enqueue(name: AnalyticsEventName, props?: Record<string, unknown>): void {
    if (!isProductEvent(name)) return;
    this.backlog.add({
      id: this.uuid(),
      name,
      ts: new Date(this.now()).toISOString(),
      properties: pickProductProps(name, props),
      attempts: 0,
    });
    // An open attempt and a held pipe both already own the next flush (every
    // settle re-schedules while anything is queued), and starting one here
    // would buy a bearer refresh per event.
    if (this.inFlight || this.held) return;
    if (this.backlog.size >= FLUSH_AT_QUEUED) void this.flush();
    else this.scheduleFlush();
  }

  /** Ship what is queued now (a burst, a goodbye, a session arriving). */
  async flush(): Promise<void> {
    if (this.inFlight) {
      // A session that arrives mid-attempt must not be stranded: the batch
      // that is about to land back in the backlog ships as soon as this
      // attempt settles.
      this.flushRequested = true;
      return;
    }
    this.unschedule();
    if (this.backlog.size === 0) {
      // `held` must never outlive the batch that caused it, or the next event
      // would wait on a re-poll nobody scheduled.
      this.holdDelayMs = 0;
      return;
    }
    const batch = this.backlog.take(MAX_BATCH);
    this.inFlight = true;
    let result: ProductAnalyticsSendResult;
    try {
      result = await this.deps.transport(batch.map(toWireEvent));
    } catch (error) {
      // The transport answers with a result for every expected outcome, the
      // device being offline included, so a throw is a bug worth hearing about.
      this.deps.onLost?.("unexpected", error);
      result = { status: "failed" };
    } finally {
      this.inFlight = false;
    }
    this.settle(batch, result);
    if (!this.flushRequested) return;
    this.flushRequested = false;
    await this.flush();
  }

  /** Forget everything queued (a deployment with nowhere to ship to). */
  clear(): void {
    this.unschedule();
    this.backlog.clear();
    this.holdDelayMs = 0;
    this.flushRequested = false;
  }

  private settle(
    batch: PendingEvent[],
    result: ProductAnalyticsSendResult,
  ): void {
    if (result.status === "no-session") {
      // Signed out is a lifecycle state, not a failure: the batch keeps its
      // attempts and waits for a bearer. It re-polls on a widening delay of
      // its own, because a session can arrive without the token change the
      // sink re-flushes on (a refresh landing mid-attempt).
      this.backlog.putBack(batch);
      this.holdDelayMs = this.held
        ? Math.min(this.holdDelayMs * 2, MAX_HOLD_DELAY_MS)
        : FLUSH_DELAY_MS;
      this.scheduleFlush(this.holdDelayMs);
      return;
    }
    this.holdDelayMs = 0;
    if (result.status === "failed") {
      for (const event of batch) event.attempts += 1;
      // A batch that died twice on the wire is dropped without a report: the
      // device being offline is an expected state, never a bug (CLAUDE.md).
      this.backlog.putBack(batch.filter((e) => e.attempts < MAX_ATTEMPTS));
      if (this.backlog.size > 0) this.scheduleFlush();
      return;
    }
    // The gateway refused these by name/shape — resending changes nothing, so
    // they are dropped, and the disagreement is reported.
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
