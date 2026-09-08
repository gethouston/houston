import type { WireEvent } from "@houston/runtime-client";

/**
 * A session's three independent subscriber fan-outs: the translated wire events
 * a turn produces, the raw liveness tick, and the assistant message-start
 * boundary. Kept apart because they carry different traffic — see
 * `subscribeLiveness` and `subscribeAssistantMessageStart`.
 */
export class SessionEventHub {
  private readonly listeners = new Set<(e: WireEvent) => void>();
  private readonly livenessListeners = new Set<() => void>();
  private readonly messageStartListeners = new Set<() => void>();

  subscribe(listener: (e: WireEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Every SDK message the query yields, before translation. `translate` drops
   * `input_json_delta` (a tool call's streamed input) until the block closes,
   * so a long file write is wire-silent; the liveness channel still ticks.
   */
  subscribeLiveness(listener: () => void): () => void {
    this.livenessListeners.add(listener);
    return () => {
      this.livenessListeners.delete(listener);
    };
  }

  /**
   * The Messages API `message_start` stream event of the main thread: one
   * model round-trip beginning (a subagent's stream carries a parent tool id
   * and is not this conversation's message).
   */
  subscribeAssistantMessageStart(listener: () => void): () => void {
    this.messageStartListeners.add(listener);
    return () => {
      this.messageStartListeners.delete(listener);
    };
  }

  emit(e: WireEvent): void {
    for (const l of this.listeners) l(e);
  }

  tickLiveness(): void {
    for (const l of this.livenessListeners) l();
  }

  emitAssistantMessageStart(): void {
    for (const l of this.messageStartListeners) l();
  }

  clearListeners(): void {
    this.listeners.clear();
    this.livenessListeners.clear();
    this.messageStartListeners.clear();
  }
}
