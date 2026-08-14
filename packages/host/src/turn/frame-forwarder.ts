import { isTerminalFrame, type SequencedFrame } from "@houston/runtime-client";
import type { TurnBus } from "./bus";
import { eventChannel } from "./relay-dialect";

/**
 * Long enough for legitimate tool-heavy turns, bounded so dead SSE captures
 * cannot leak forever.
 */
const CAPTURE_IDLE_MS = 30 * 60 * 1000;
const STOP_DRAIN_TIMEOUT_MS = 3_000;

export interface TurnLogSender {
  send(conversationId: string, frames: SequencedFrame[]): Promise<void>;
}

interface CaptureState {
  conversationId: string;
  frames: SequencedFrame[];
  timer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
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
    this.armIdleWatchdog(relayKey, state);
  }

  release(relayKey: string): void {
    const state = this.states.get(relayKey);
    if (!state) return;
    this.evict(relayKey, state);
  }

  async stop(): Promise<void> {
    for (const [relayKey, state] of this.states) {
      this.evict(relayKey, state);
    }
    const pending = [...this.sendTails.values()];
    if (pending.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), STOP_DRAIN_TIMEOUT_MS);
      timer.unref?.();
    });
    const result = await Promise.race([
      Promise.allSettled(pending).then(() => "settled" as const),
      timeout,
    ]);
    clearTimeout(timer);
    if (result === "timeout") {
      console.debug(
        `[turnlog] stop timed out with ${pending.length} batch send(s) still pending`,
      );
    }
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
    this.armIdleWatchdog(relayKey, state);
    state.frames.push(frame);
    const terminal = isTerminalFrame(frame.type);
    if (terminal || state.frames.length >= this.batchSize) {
      this.flush(state);
    } else if (!state.timer) {
      state.timer = setTimeout(() => this.flush(state), this.batchMs);
      state.timer.unref?.();
    }
    if (terminal) {
      this.evict(relayKey, state, false);
    }
  }

  private armIdleWatchdog(relayKey: string, state: CaptureState): void {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(
      () => this.evict(relayKey, state),
      CAPTURE_IDLE_MS,
    );
    state.idleTimer.unref?.();
  }

  private evict(relayKey: string, state: CaptureState, flush = true): void {
    if (this.states.get(relayKey) !== state) return;
    if (state.timer) clearTimeout(state.timer);
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.timer = undefined;
    state.idleTimer = undefined;
    if (flush) this.flush(state);
    state.unsubscribe();
    this.states.delete(relayKey);
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
