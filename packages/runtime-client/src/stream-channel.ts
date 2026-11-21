import { isTerminalFrame, ReplayLog, type SequencedFrame } from "./replay";
import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT,
  reduceSnapshot,
} from "./snapshot";
import type { WireFrame } from "./types";

export class StreamChannel {
  #log: ReplayLog;
  #snap: ConversationSnapshot;

  constructor(seed: ConversationSnapshot = EMPTY_SNAPSHOT) {
    this.#log = new ReplayLog(seed.seq);
    this.#snap = { ...seed };
  }

  get snapshot(): ConversationSnapshot {
    return this.#snap;
  }

  replayAfter(after: number): SequencedFrame[] | null {
    return this.#log.replayAfter(after);
  }

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
    if (isTerminalFrame(frame.type)) this.#log.clear();
  }
}
