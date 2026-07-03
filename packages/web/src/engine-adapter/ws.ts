import { bus } from "./bus";
import type { HoustonClient } from "./client";
import { disposeAllStreams } from "./stream-registry";

/** Same topic helpers shape as the real package (the UI imports `topics`). */
export const topics = {
  firehose: "*",
  session: (sessionKey: string) => `session:${sessionKey}`,
  agent: (agentPath: string) => `agent:${agentPath}`,
  routines: (agentPath: string) => `routines:${agentPath}`,
  auth: "auth",
  toast: "toast",
  events: "events",
  scheduler: "scheduler",
  composio: "composio",
  claude: "claude",
  providers: "providers",
} as const;

type EnvelopeHandler = (env: unknown) => void;
type EventHandler = (event: unknown) => void;

/**
 * Drop-in replacement for the real `EngineWebSocket`. There is no socket: the
 * new engine streams over SSE (handled inside HoustonClient.startSession), and
 * those events are delivered here through the in-process `bus`. The public API
 * matches the original so app/src wiring (subscribeHoustonEvents, etc.) is
 * unchanged.
 */
export class EngineWebSocket {
  private eventHandlers = new Set<EventHandler>();
  private envelopeHandlers = new Set<EnvelopeHandler>();
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
      if (this.envelopeHandlers.size > 0) {
        const env = {
          v: 1,
          id: crypto.randomUUID(),
          kind: "event",
          ts: Date.now(),
          payload: event,
        };
        for (const h of this.envelopeHandlers) h(env);
      }
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

  on(_: "event", handler: EnvelopeHandler): () => void {
    this.envelopeHandlers.add(handler);
    return () => this.envelopeHandlers.delete(handler);
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onReconnect(): () => void {
    // The bus never drops, so reconnect never fires.
    return () => {};
  }

  // Subscriptions are no-ops: the bus delivers every event; the UI routes by
  // the agent_path/session_key carried in each event.
  subscribe(): void {}
  unsubscribe(): void {}
  send(): void {}
}
