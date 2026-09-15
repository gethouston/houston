import { bus } from "./bus";
import type { HoustonClient } from "./client";
import { disposeAllStreams } from "./stream-registry";

type EventHandler = (event: unknown) => void;

/**
 * The app's handle on the engine's event firehose. There is no socket: the host
 * streams over SSE (`/v1/events`, opened by `subscribeServerEvents`) and the
 * turn machinery emits locally, and both land on the in-process `bus`. Every
 * event reaches every handler — the UI routes by the `agent_path`/`session_key`
 * each event carries — so there is nothing to subscribe to.
 */
export class EngineWebSocket {
  private eventHandlers = new Set<EventHandler>();
  private offBus: (() => void) | null = null;
  private offServer: (() => void) | null = null;
  /** Pending conversation-stream teardown; a reconnect within the tick cancels it. */
  private disposeStreamsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: HoustonClient) {}

  connect(): void {
    if (this.disposeStreamsTimer !== null) {
      // disconnect() immediately followed by connect() (the token-rotation
      // bounce in setHostedEngineSessionToken): the client lives on, so the
      // conversation streams must too.
      clearTimeout(this.disposeStreamsTimer);
      this.disposeStreamsTimer = null;
    }
    if (this.offBus) return;
    // Cloud: also pull the host's domain-change events onto the bus.
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
    // Real teardown (logout / mode change): the conversation streams (turns +
    // observers) must not outlive their client. Deferred one tick so the
    // token-rotation disconnect()+connect() bounce — which keeps the client —
    // doesn't kill a live turn's rendering; connect() cancels it.
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
