/**
 * Managed WebSocket with auto-reconnect and typed event handlers.
 *
 * Usage:
 * ```ts
 * const ws = new EngineWebSocket(client);
 * const off = ws.onEvent((event) => { ... });
 * ws.subscribe(["session:key1", "toast", "auth"]);
 * ws.connect();
 * ```
 *
 * Topic constants live in `./topics` — import `topics` from the package
 * entry to subscribe to specific channels.
 */

import type { EngineEnvelope } from "./types";
import type { HoustonClient } from "./client";

type EnvelopeHandler = (env: EngineEnvelope) => void;
type EventHandler = (event: unknown) => void;
type ReconnectHandler = () => void;

export class EngineWebSocket {
  private socket: WebSocket | null = null;
  private envelopeHandlers: Set<EnvelopeHandler> = new Set();
  private eventHandlers: Set<EventHandler> = new Set();
  private reconnectHandlers: Set<ReconnectHandler> = new Set();
  private reconnectAttempts = 0;
  private shouldRun = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set on the FIRST `onopen` so we can distinguish initial connect
   * from a reconnect. Reconnect → consumers must refetch any data they
   * cached, since they may have missed events while the socket was
   * down. (CF idle timeout, tunnel watchdog, mobile tab suspension —
   * all routine causes.) */
  private hasConnectedOnce = false;
  /** Topics the caller wants subscribed. Re-sent on every reconnect. */
  private subscribed: Set<string> = new Set();

  constructor(private client: HoustonClient) {}

  connect(): void {
    this.shouldRun = true;
    this.open();
  }

  disconnect(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  /**
   * Swap the underlying client and force a reconnect.
   *
   * Needed for cloud mode: when the signed-in user changes (and so does
   * the per-tenant engine pod they should talk to), `setCloudEngineConfig`
   * has to point the WS at the new pod with the new token. Without this,
   * REST goes to the new tenant but the WS keeps using the previous
   * client's `wsUrl()` — i.e. the previous token — and either reconnects
   * to the wrong pod or 401s against the right one. Either way events
   * like `ProviderLoginUrl` never reach the UI.
   *
   * Event handlers and topic subscriptions are preserved across the
   * swap: subscriptions are re-sent automatically in `onopen` after the
   * new socket connects.
   */
  setClient(client: HoustonClient): void {
    if (this.client === client) return;
    this.client = client;
    if (this.shouldRun) {
      // Close the current socket; `onclose` will schedule a reconnect
      // which uses the new `client.wsUrl()`.
      this.socket?.close();
    }
  }

  /** Raw envelope handler — called for every frame. */
  on(_: "event", handler: EnvelopeHandler): () => void {
    this.envelopeHandlers.add(handler);
    return () => this.envelopeHandlers.delete(handler);
  }

  /**
   * Typed event handler — called once per `HoustonEvent` (kind:"event"
   * frames, payload is the tagged event object). Non-event frames are
   * filtered out. Lag markers (`{type:"Lag",...}`) pass through.
   */
  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Fired AFTER a reconnect succeeds (not on the first connect). Use
   * this to refetch any cached data — events emitted while the socket
   * was down were never delivered and won't be replayed. Examples:
   * a chat session completed during a 30s mobile tab suspension; the
   * `SessionStatus::Completed` event was lost; without a refetch the
   * UI shows "thinking..." until the user manually reloads.
   */
  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  send(envelope: EngineEnvelope): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(envelope));
    }
  }

  /** Subscribe to topics. Idempotent — re-sent on reconnect. */
  subscribe(newTopics: string[]): void {
    const fresh = newTopics.filter((t) => !this.subscribed.has(t));
    for (const t of newTopics) this.subscribed.add(t);
    if (fresh.length === 0) return;
    this.sendSub(fresh);
  }

  /** Unsubscribe from topics. */
  unsubscribe(stale: string[]): void {
    const toDrop = stale.filter((t) => this.subscribed.has(t));
    for (const t of stale) this.subscribed.delete(t);
    if (toDrop.length === 0) return;
    this.sendEnvelope({ op: "unsub", topics: toDrop });
  }

  private sendSub(list: string[]): void {
    this.sendEnvelope({ op: "sub", topics: list });
  }

  private sendEnvelope(payload: unknown): void {
    this.send({
      v: 1,
      id: crypto.randomUUID(),
      kind: "req",
      ts: Date.now(),
      payload,
    });
  }

  private open(): void {
    const ws = new WebSocket(this.client.wsUrl());
    this.socket = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Re-subscribe to all live topics.
      if (this.subscribed.size > 0) {
        this.sendSub(Array.from(this.subscribed));
      }
      if (this.hasConnectedOnce) {
        for (const h of this.reconnectHandlers) {
          try {
            h();
          } catch (e) {
            // A bad handler must not poison the others or the socket.
            console.error("[ws] onReconnect handler threw:", e);
          }
        }
      }
      this.hasConnectedOnce = true;
    };

    ws.onmessage = (ev) => {
      try {
        const env = JSON.parse(ev.data) as EngineEnvelope;
        for (const h of this.envelopeHandlers) h(env);
        if (env.kind === "event") {
          for (const h of this.eventHandlers) h(env.payload);
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    ws.onclose = () => {
      if (!this.shouldRun) return;
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempts);
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}
