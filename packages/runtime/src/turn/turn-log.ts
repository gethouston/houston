import type { SequencedFrame, WireFrame } from "@houston/runtime-client";
import type { TurnServerDeps } from "./server-types";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

interface TurnLogOptions {
  baseUrl: string;
  org: string;
  agent: string;
  conversationId: string;
  hostToken: string;
  claim: { token: string; bootId: string };
  fetchImpl?: typeof fetch;
  batchMs?: number;
  batchSize?: number;
  /** First seq to stamp (the conversation's stream continues, never restarts). */
  seqStart?: number;
}

const REQUEST_TIMEOUT_MS = 5_000;

const terminal = (frame: WireFrame) =>
  frame.type === "done" || frame.type === "error";

/** One turn's ordered, failure-isolated turnlog batcher. */
export class TurnLog {
  private readonly fetchImpl: typeof fetch;
  private readonly batchMs: number;
  private readonly batchSize: number;
  private readonly frames: SequencedFrame[] = [];
  private seq: number;
  private disabled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tail = Promise.resolve();

  constructor(private readonly opts: TurnLogOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.batchMs = opts.batchMs ?? 250;
    this.batchSize = opts.batchSize ?? 32;
    this.seq = (opts.seqStart ?? 1) - 1;
  }

  /** Sequence and enqueue one frame, flushing terminal frames immediately. */
  record(frame: WireFrame): SequencedFrame {
    // SAFETY: spreading a WireFrame preserves its discriminated shape while
    // adding the sole field required by SequencedFrame.
    const sequenced = { ...frame, seq: ++this.seq } as SequencedFrame;
    if (this.disabled) return sequenced;
    this.frames.push(sequenced);
    if (terminal(frame) || this.frames.length >= this.batchSize) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.batchMs);
      this.timer.unref?.();
    }
    return sequenced;
  }

  /** Flush queued frames after earlier batches, swallowing logged failures. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const frames = this.frames.splice(0);
    if (frames.length > 0 && !this.disabled) {
      this.tail = this.tail.then(() => this.send(frames));
    }
    await this.tail;
  }

  private async send(frames: SequencedFrame[]): Promise<void> {
    if (this.disabled) return;
    const root = this.opts.baseUrl.replace(/\/+$/, "");
    const url = `${root}/v1/pod/turnlog/${encodeURIComponent(
      this.opts.org,
    )}/${encodeURIComponent(this.opts.agent)}/${encodeURIComponent(
      this.opts.conversationId,
    )}`;
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.hostToken}`,
          "Content-Type": "application/json",
          "X-Houston-Claim-Token": this.opts.claim.token,
          "X-Houston-Claim-Boot": this.opts.claim.bootId,
        },
        body: JSON.stringify(
          frames.map((frame) => ({ seq: frame.seq, frame })),
        ),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return;
      if (response.status === 404) {
        this.disabled = true;
        console.debug("[turnlog] gateway route unavailable for this turn");
        return;
      }
      console.warn(
        `[turnlog] batch failed (${response.status}): ${(
          await response.text()
        ).slice(0, 300)}`,
      );
    } catch (error) {
      console.warn(
        "[turnlog] batch failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/** Create a claim-authorized sender when this non-shadow turn enables it. */
export function createTurnLog(
  deps: TurnServerDeps,
  turn: TurnRequest,
): TurnLog | null {
  const baseUrl = deps.turnLogUrl ?? process.env.HOUSTON_TURNLOG_URL;
  if (turn.shadow || !baseUrl || !turn.claim || !turn.hostToken) return null;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return new TurnLog({
    baseUrl,
    org,
    agent,
    conversationId: turn.conversationId,
    hostToken: turn.hostToken,
    claim: { token: turn.claim.token, bootId: turn.claim.bootId },
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(turn.turnlogSeqStart ? { seqStart: turn.turnlogSeqStart } : {}),
  });
}
