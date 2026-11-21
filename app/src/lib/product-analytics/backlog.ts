import type { ProductAnalyticsEvent } from "./wire.ts";

const MAX_QUEUED = 200;

export interface PendingEvent extends ProductAnalyticsEvent {
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

  take(max: number): PendingEvent[] {
    return this.pending.splice(0, max);
  }

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
    this.pending.splice(MAX_QUEUED, excess);
    this.onOverflow(excess);
  }
}

export function toWireEvent(event: PendingEvent): ProductAnalyticsEvent {
  return {
    id: event.id,
    name: event.name,
    ts: event.ts,
    properties: event.properties,
  };
}
