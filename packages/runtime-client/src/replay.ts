import { RingBuffer } from "./ring-buffer";
import type { WireEventType, WireFrame } from "./types";

export type SequencedFrame = WireFrame & { seq: number };

export const REPLAY_BUFFER_CAP = 1024;

export function isTerminalFrame(type: WireEventType): boolean {
  return type === "done" || type === "error" || type === "provider_error";
}

export class ReplayLog {
  #watermark: number;
  #buffer = new RingBuffer<SequencedFrame>(REPLAY_BUFFER_CAP);

  constructor(watermark = 0) {
    this.#watermark = watermark;
  }

  get watermark(): number {
    return this.#watermark;
  }

  append(event: WireFrame): SequencedFrame {
    const seq = this.#watermark + 1;
    this.#watermark = seq;
    const frame: SequencedFrame = { ...event, seq };
    this.#buffer.push(frame);
    return frame;
  }

  replayAfter(after: number): SequencedFrame[] | null {
    if (after > this.#watermark) return null;
    if (after === this.#watermark) return [];
    const first = this.#buffer.at(0)?.seq ?? this.#watermark + 1;
    if (after < first - 1) return null;
    return this.#buffer.sliceFrom(this.#firstIndexAfter(after));
  }

  #firstIndexAfter(after: number): number {
    let lo = 0;
    let hi = this.#buffer.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.#buffer.at(mid) as SequencedFrame).seq > after) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  clear(): void {
    this.#buffer.clear();
  }
}

export function parseResumeCursor(
  afterParam: string | null,
  lastEventId?: string | string[],
): number | undefined {
  const header = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
  const fromHeader = parseCursorValue(header ?? null);
  if (fromHeader !== undefined) return fromHeader;
  return parseCursorValue(afterParam);
}

function parseCursorValue(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function formatSseFrame(frame: WireFrame): string {
  const body = `data: ${JSON.stringify(frame)}\n\n`;
  return frame.seq === undefined ? body : `id: ${frame.seq}\n${body}`;
}
