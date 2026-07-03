import type { WireEventType, WireFrame } from "./types";

/**
 * Shared sequencing + resume semantics for conversation event streams — the
 * ONE implementation behind every fan-out authority (the runtime's bus, the
 * host's turn relay), next to the snapshot reducer for the same reason: both
 * sides of the wire must agree exactly.
 *
 * A ReplayLog owns a conversation's seq counter (strictly monotonic from 1,
 * process-lifetime — never reset) and a ring buffer of the in-flight turn's
 * sequenced frames, so a reconnecting client can resume with `?after=<seq>`
 * (or `Last-Event-ID`) without a gap or a duplicate. The buffer covers the
 * in-flight turn only: the owner clears it right after publishing a terminal
 * frame; a cursor the buffer can no longer serve falls back to a `resync`
 * sync + history refetch, which after turn end is complete and correct.
 */

/** A frame that has been through a ReplayLog: `seq` is definitely set. */
export type SequencedFrame = WireFrame & { seq: number };

/** Max buffered frames per conversation; overflow drops the oldest. */
export const REPLAY_BUFFER_CAP = 1024;

/** Terminal frames end the turn — the publisher clears its ReplayLog after fan-out. */
export function isTerminalFrame(type: WireEventType): boolean {
  return type === "done" || type === "error" || type === "provider_error";
}

export class ReplayLog {
  #watermark: number;
  #buffer: SequencedFrame[] = [];

  /** `watermark` seeds the counter (e.g. from a persisted snapshot); frames start at watermark+1. */
  constructor(watermark = 0) {
    this.#watermark = watermark;
  }

  /** Highest seq ever assigned (0 = nothing published yet). */
  get watermark(): number {
    return this.#watermark;
  }

  /**
   * Sequence + buffer one event, returning the sequenced frame. The frame is
   * ALWAYS stamped `watermark + 1`: this log is the stream's one sequencing
   * authority, and an incoming `seq` (whatever upstream produced it) is
   * ignored — re-stamping a duplicate or stale seq as if it were new content
   * is exactly the hazard a single authority exists to prevent.
   */
  append(event: WireFrame): SequencedFrame {
    const seq = this.#watermark + 1;
    this.#watermark = seq;
    const frame: SequencedFrame = { ...event, seq };
    this.#buffer.push(frame);
    if (this.#buffer.length > REPLAY_BUFFER_CAP) this.#buffer.shift();
    return frame;
  }

  /**
   * The frames a client that saw everything up to `after` still needs, in
   * order. Null = the cursor is unserviceable (older than the buffered window,
   * or ahead of the watermark — e.g. from before a restart) and the caller
   * must fall back to a `resync` sync frame.
   */
  replayAfter(after: number): SequencedFrame[] | null {
    if (after > this.#watermark) return null;
    if (after === this.#watermark) return [];
    const first = this.#buffer[0]?.seq ?? this.#watermark + 1;
    if (after < first - 1) return null;
    return this.#buffer.filter((f) => f.seq > after);
  }

  /** Drop the buffered frames (turn ended). The seq counter is NOT reset. */
  clear(): void {
    this.#buffer = [];
  }
}

/**
 * The resume cursor of a conversation events request: `?after=<n>` wins over
 * the standard `Last-Event-ID` header. A non-numeric / negative / non-integer
 * value is treated as absent (that source is ignored). Undefined = no cursor:
 * serve the fresh-connect contract (sync, then live frames).
 */
export function parseResumeCursor(
  afterParam: string | null,
  lastEventId?: string | string[],
): number | undefined {
  const query = parseCursorValue(afterParam);
  if (query !== undefined) return query;
  const header = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
  return parseCursorValue(header ?? null);
}

function parseCursorValue(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

/**
 * Serialize one conversation SSE frame (the whole WireFrame envelope — type,
 * data, and the optional seq/turnId). A sequenced frame carries its seq both
 * in the JSON envelope and as the SSE `id:` line (the standard EventSource
 * resume affordance — the browser echoes it back as `Last-Event-ID`).
 */
export function formatSseFrame(frame: WireFrame): string {
  const body = `data: ${JSON.stringify(frame)}\n\n`;
  return frame.seq === undefined ? body : `id: ${frame.seq}\n${body}`;
}
