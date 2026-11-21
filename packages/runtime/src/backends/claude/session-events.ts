import type { WireEvent } from "@houston/runtime-client";
import type { HarnessTimingEvent, ReplyBeat } from "../types";

export class SessionEventHub {
  private readonly listeners = new Set<(e: WireEvent) => void>();
  private readonly livenessListeners = new Set<() => void>();
  private readonly messageStartListeners = new Set<() => void>();
  private readonly replyBeatListeners = new Set<(beat: ReplyBeat) => void>();
  private readonly timingListeners = new Set<(e: HarnessTimingEvent) => void>();

  subscribe(listener: (e: WireEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeLiveness(listener: () => void): () => void {
    this.livenessListeners.add(listener);
    return () => {
      this.livenessListeners.delete(listener);
    };
  }

  subscribeAssistantMessageStart(listener: () => void): () => void {
    this.messageStartListeners.add(listener);
    return () => {
      this.messageStartListeners.delete(listener);
    };
  }

  subscribeReplyBeats(listener: (beat: ReplyBeat) => void): () => void {
    this.replyBeatListeners.add(listener);
    return () => {
      this.replyBeatListeners.delete(listener);
    };
  }

  subscribeModelCalls(listener: (e: HarnessTimingEvent) => void): () => void {
    this.timingListeners.add(listener);
    return () => {
      this.timingListeners.delete(listener);
    };
  }

  emitTiming(e: HarnessTimingEvent): void {
    for (const l of this.timingListeners) l(e);
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

  emitReplyBeat(beat: ReplyBeat): void {
    for (const l of this.replyBeatListeners) l(beat);
  }

  clearListeners(): void {
    this.listeners.clear();
    this.livenessListeners.clear();
    this.messageStartListeners.clear();
    this.replyBeatListeners.clear();
    this.timingListeners.clear();
  }
}

export abstract class SessionEventSubscriptions {
  protected readonly events = new SessionEventHub();

  subscribe(listener: (e: WireEvent) => void): () => void {
    return this.events.subscribe(listener);
  }

  subscribeLiveness(listener: () => void): () => void {
    return this.events.subscribeLiveness(listener);
  }

  subscribeAssistantMessageStart(listener: () => void): () => void {
    return this.events.subscribeAssistantMessageStart(listener);
  }

  subscribeReplyBeats(listener: (beat: ReplyBeat) => void): () => void {
    return this.events.subscribeReplyBeats(listener);
  }

  subscribeModelCalls(listener: (e: HarnessTimingEvent) => void): () => void {
    return this.events.subscribeModelCalls(listener);
  }
}
