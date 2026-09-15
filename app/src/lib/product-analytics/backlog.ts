/**
 * The bounded buffer behind the queue: what is waiting to ship, what the cap
 * throws away when nobody can deliver it, and the wire shape a batch takes on
 * its way out. The queue (`queue.ts`) owns WHEN things ship; this owns WHAT is
 * held while they don't.
 */

import type { ProductAnalyticsEvent } from "./wire.ts";

/** Ceiling on a backlog nobody could deliver (offline, signed out). */
const MAX_QUEUED = 200;

export interface PendingEvent extends ProductAnalyticsEvent {
  /** Delivery attempts spent on it; a held batch spends none. */
  attempts: number;
}

export class ProductAnalyticsBacklog {
  private pending: PendingEvent[] = [];
  private readonly onOverflow: (count: number) => void;

  constructor(onOverflow: (count: number) => void) {
    this.onOverflow = onOverflow;
  }

  get size(): number {
    return this.pending.length;
  }

  add(event: PendingEvent): void {
    this.pending.push(event);
    this.trim();
  }

  /** Takes up to `max` events off the front — oldest first. */
  take(max: number): PendingEvent[] {
    return this.pending.splice(0, max);
  }

  /** Returns an undelivered batch to the front, keeping the event order. */
  putBack(batch: PendingEvent[]): void {
    if (batch.length === 0) return;
    this.pending.unshift(...batch);
    this.trim();
  }

  clear(): void {
    this.pending = [];
  }

  private trim(): void {
    const excess = this.pending.length - MAX_QUEUED;
    if (excess <= 0) return;
    // The NEWEST events go. A held backlog is holding the launch beats the
    // funnel is read from, and they are the ones a session finally arriving
    // would deliver; dropping them for a later tab-open would be backwards.
    this.pending.splice(MAX_QUEUED, excess);
    this.onOverflow(excess);
  }
}

/** Drops the delivery bookkeeping: the route refuses unknown fields. */
export function toWireEvent(event: PendingEvent): ProductAnalyticsEvent {
  return {
    id: event.id,
    name: event.name,
    ts: event.ts,
    properties: event.properties,
  };
}
