import { isTerminalFrame, type SequencedFrame } from "@houston/runtime-client";
import type { TurnBus } from "./bus";
import { eventChannel } from "./relay-dialect";

export interface TurnLogSender {
  send(conversationId: string, frames: SequencedFrame[]): Promise<void>;
}

interface CaptureState {
  conversationId: string;
  frames: SequencedFrame[];
  timer?: ReturnType<typeof setTimeout>;
  unsubscribe: () => void;
}

/** Unconditional ev2 subscriber: batches relay frames even with no SSE client. */
export class FrameForwarder {
  private readonly states = new Map<string, CaptureState>();
  private readonly sendTails = new Map<string, Promise<void>>();
  private readonly batchMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly opts: {
      bus: TurnBus;
      sender: TurnLogSender;
      batchMs?: number;
      batchSize?: number;
    },
  ) {
    this.batchMs = opts.batchMs ?? 250;
    this.batchSize = opts.batchSize ?? 32;
  }

  capture(conversationId: string, relayKey: string): void {
    if (this.states.has(relayKey)) return;
    const state: CaptureState = {
      conversationId,
      frames: [],
      unsubscribe: () => {},
    };
    state.unsubscribe = this.opts.bus.subscribe(
      eventChannel(relayKey),
      (message) => this.onMessage(relayKey, state, message),
    );
    this.states.set(relayKey, state);
  }

  stop(): void {
    for (const state of this.states.values()) {
      if (state.timer) clearTimeout(state.timer);
      this.flush(state);
      state.unsubscribe();
    }
    this.states.clear();
  }

  private onMessage(
    relayKey: string,
    state: CaptureState,
    message: string,
  ): void {
    let frame: SequencedFrame;
    try {
      frame = JSON.parse(message) as SequencedFrame;
      if (!Number.isSafeInteger(frame.seq)) throw new Error("missing seq");
    } catch (error) {
      console.debug(
        `[turnlog] ignored malformed ev2 frame for ${relayKey}`,
        error,
      );
      return;
    }
    state.frames.push(frame);
    const terminal = isTerminalFrame(frame.type);
    if (terminal || state.frames.length >= this.batchSize) {
      this.flush(state);
    } else if (!state.timer) {
      state.timer = setTimeout(() => this.flush(state), this.batchMs);
      state.timer.unref?.();
    }
    if (terminal) {
      state.unsubscribe();
      this.states.delete(relayKey);
    }
  }

  private flush(state: CaptureState): void {
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    const frames = state.frames.splice(0);
    if (frames.length === 0) return;
    const conversationId = state.conversationId;
    const prior = this.sendTails.get(conversationId) ?? Promise.resolve();
    const task = prior
      .then(() => this.opts.sender.send(state.conversationId, frames))
      .catch((error: unknown) => {
        console.debug(
          `[turnlog] batch forward failed for ${conversationId}; live-pod resume remains available`,
          error,
        );
      })
      .finally(() => {
        if (this.sendTails.get(conversationId) === task) {
          this.sendTails.delete(conversationId);
        }
      });
    this.sendTails.set(conversationId, task);
  }
}
