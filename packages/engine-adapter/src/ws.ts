import { bus } from "./bus";
import type { HoustonClient } from "./client";
import { disposeAllStreams } from "./stream-registry";

type EventHandler = (event: unknown) => void;

export class EngineWebSocket {
  private eventHandlers = new Set<EventHandler>();
  private offBus: (() => void) | null = null;
  private offServer: (() => void) | null = null;
  private disposeStreamsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: HoustonClient) {}

  connect(): void {
    if (this.disposeStreamsTimer !== null) {
      clearTimeout(this.disposeStreamsTimer);
      this.disposeStreamsTimer = null;
    }
    if (this.offBus) return;
    this.offServer = this.client.subscribeServerEvents();
    this.offBus = bus.on((event) => {
      for (const h of this.eventHandlers) h(event);
    });
  }

  disconnect(): void {
    this.offServer?.();
    this.offServer = null;
    this.offBus?.();
    this.offBus = null;
    if (this.disposeStreamsTimer === null) {
      this.disposeStreamsTimer = setTimeout(() => {
        this.disposeStreamsTimer = null;
        disposeAllStreams();
      }, 0);
    }
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }
}
