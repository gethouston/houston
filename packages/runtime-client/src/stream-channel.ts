import { isTerminalFrame, ReplayLog, type SequencedFrame } from "./replay";
import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT,
  reduceSnapshot,
} from "./snapshot";
import type { WireFrame } from "./types";

/**
 * One conversation's publish-side stream state: the ReplayLog (seq authority +
 * in-flight-turn replay buffer) and the reduced snapshot, with the
 * load-bearing publish ordering in ONE place:
 *
 *   1. append   — stamp `watermark + 1` and buffer the frame
 *   2. reduce   — fold the sequenced frame into the snapshot
 *   3. fan out  — deliver frame + snapshot (in-process subscribers, or a bus
 *                 persist + broadcast)
 *   4. clear    — on a terminal frame, drop the replay buffer AFTER fan-out,
 *                 so the terminal frame itself was buffered and broadcast
 *                 before the window closes (the seq counter never resets)
 *
 * Used by every fan-out authority (the runtime's session bus, the host turn
 * relay's channels) so the ordering can't drift between them. Browser-safe:
 * no node imports — fan-out is a callback, not a socket.
 */
export class StreamChannel {
  #log: ReplayLog;
  #snap: ConversationSnapshot;

  /** `seed` continues an existing stream (e.g. from a persisted snapshot). */
  constructor(seed: ConversationSnapshot = EMPTY_SNAPSHOT) {
    this.#log = new ReplayLog(seed.seq);
    this.#snap = { ...seed };
  }

  /** The current snapshot; `seq` is the stream's watermark. */
  get snapshot(): ConversationSnapshot {
    return this.#snap;
  }

  /** Replay window for a resume cursor (see ReplayLog.replayAfter). */
  replayAfter(after: number): SequencedFrame[] | null {
    return this.#log.replayAfter(after);
  }

  /** Publish with a synchronous fan-out (in-process subscriber delivery). */
  publish(
    event: WireFrame,
    fanout: (frame: SequencedFrame, snap: ConversationSnapshot) => void,
  ): SequencedFrame {
    const frame = this.#sequence(event);
    try {
      fanout(frame, this.#snap);
    } finally {
      this.#settle(frame);
    }
    return frame;
  }

  /**
   * Publish with an asynchronous fan-out (bus persist + broadcast) — the same
   * append → reduce → fan out → clear ordering, with the terminal clear
   * deferred until the fan-out settles. Callers MUST serialize publishes per
   * conversation (the relay pump awaits each one) so a later append can't
   * land inside a pending terminal clear.
   */
  async publishAsync(
    event: WireFrame,
    fanout: (
      frame: SequencedFrame,
      snap: ConversationSnapshot,
    ) => Promise<void>,
  ): Promise<SequencedFrame> {
    const frame = this.#sequence(event);
    try {
      await fanout(frame, this.#snap);
    } finally {
      this.#settle(frame);
    }
    return frame;
  }

  #sequence(event: WireFrame): SequencedFrame {
    const frame = this.#log.append(event);
    this.#snap = reduceSnapshot(this.#snap, frame);
    return frame;
  }

  #settle(frame: SequencedFrame): void {
    // The turn is over: drop the replay window AFTER the terminal frame has
    // been fanned out and buffered. A cursor from inside the cleared turn
    // resyncs — history is persisted at turn end, so the refetch is complete.
    if (isTerminalFrame(frame.type)) this.#log.clear();
  }
}
