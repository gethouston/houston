import type { HoustonEvent } from "@houston/protocol";
import type { UserId } from "../domain/types";

/**
 * The publish/subscribe subset of TurnBus. The EventHub depends only on this,
 * so the global event channel is decoupled from the per-turn machinery: cloud
 * passes the same bus it uses for turns (Redis → multi-replica), local passes
 * an in-process MemoryTurnBus that the FS watcher also feeds (P4).
 */
export interface PubSub {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): () => void;
}

/**
 * Per-user domain-change fan-out — the global `/v1/events` channel that drives
 * UI reactivity (TanStack Query invalidation). Scoped by user id so a cloud
 * tenant only ever receives events for their OWN agents; the host emits to the
 * workspace owner after every successful mutation.
 *
 * This carries the same HoustonEvent vocabulary the Rust firehose used — only
 * the detection mechanism differs per profile (host mutation here; FS watcher
 * locally; post-turn sync in cloud), never the wire.
 */
export interface EventHub {
  /** Emit a change to a user's subscribers across every replica. Fire-and-forget. */
  emit(userId: UserId, event: HoustonEvent): void;
  /** Subscribe to a user's events; returns unsubscribe. */
  subscribe(userId: UserId, handler: (event: HoustonEvent) => void): () => void;
}

const channelFor = (userId: UserId) => `events:${userId}`;

export class BusEventHub implements EventHub {
  constructor(private readonly bus: PubSub) {}

  emit(userId: UserId, event: HoustonEvent): void {
    // Fire-and-forget: the user-initiated action is the MUTATION, which already
    // succeeded and returned 2xx. The event is a reactivity nicety — if publish
    // fails the UI still refetches on focus, so we log (no UI thread to toast on,
    // the documented beta-policy exception) rather than sink the request.
    void this.bus.publish(channelFor(userId), JSON.stringify(event)).catch((err) => {
      console.error("[events] publish failed:", err instanceof Error ? err.message : err);
    });
  }

  subscribe(userId: UserId, handler: (event: HoustonEvent) => void): () => void {
    return this.bus.subscribe(channelFor(userId), (message) => {
      try {
        handler(JSON.parse(message) as HoustonEvent);
      } catch (err) {
        console.error("[events] dropped malformed frame:", err instanceof Error ? err.message : err);
      }
    });
  }
}
