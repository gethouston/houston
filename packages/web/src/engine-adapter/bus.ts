/**
 * Shared in-process event bus. The adapter's HoustonClient emits HoustonEvents
 * (FeedItem, SessionStatus, ActivityChanged, …) onto it; the adapter's
 * EngineWebSocket delivers them to subscribers — standing in for the old
 * engine's real WebSocket so app/src renders streaming chat unchanged.
 */
type Handler = (event: unknown) => void;

class EventBus {
  private handlers = new Set<Handler>();

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  emit(event: unknown): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (e) {
        console.error("[engine-adapter] event handler threw", e);
      }
    }
  }
}

export const bus = new EventBus();

/** Emit a HoustonEvent-shaped object. */
export function emitEvent(type: string, data: unknown): void {
  bus.emit({ type, data });
}
