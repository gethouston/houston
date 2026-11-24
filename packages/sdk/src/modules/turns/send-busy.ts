import { EngineError } from "@houston/runtime-client";
import {
  type ComputeRefusal,
  parseComputeRefusalText,
} from "@houston/wire-types";
import type { StreamTuning } from "./stream-tuning";

export const SEND_BUSY_WAIT_MS = 10 * 60_000;

export const SEND_BUSY_NOTICE_MS = 15_000;

const BUSY_RETRY_DEFAULT_MS = 3_000;
const BUSY_RETRY_MIN_MS = 1_000;
const BUSY_RETRY_MAX_MS = 30_000;

/**
 * Chat copy for a busy send that ran out of {@link SEND_BUSY_WAIT_MS}: the
 * default for surfaces without a dictionary, keyed by the `compute_busy`
 * notice.
 */
export const COMPUTE_BUSY_MESSAGE =
  "It's too busy right now to start your message. Send it again in a few minutes.";

/** The gateway's `compute_busy` refusal behind a failed send, or null. */
export function computeBusyRefusal(e: unknown): ComputeRefusal | null {
  if (!(e instanceof EngineError) || e.status !== 503) return null;
  const refusal = parseComputeRefusalText(e.body);
  return refusal?.code === "compute_busy" ? refusal : null;
}

/** Why a sent message is still waiting to start; only busy compute today. */
export type SendWaitReason = "busy";

export class SendBusyClock {
  private readonly budget: number;
  private readonly notice: number;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    tuning: StreamTuning | undefined,
    private readonly started: number = Date.now(),
  ) {
    this.budget = tuning?.sendBusyWaitMs ?? SEND_BUSY_WAIT_MS;
    this.notice = tuning?.sendBusyNoticeMs ?? SEND_BUSY_NOTICE_MS;
  }

  private get waited(): number {
    return Date.now() - this.started;
  }

  get spent(): boolean {
    return this.waited >= this.budget;
  }

  get left(): number {
    return Math.max(0, this.budget - this.waited);
  }

  armNotice(onBusy: () => void): void {
    if (this.noticeTimer !== undefined) return;
    this.noticeTimer = setTimeout(
      onBusy,
      Math.max(0, this.notice - this.waited),
    );
  }

  dispose(): void {
    clearTimeout(this.noticeTimer);
  }

  pauseFor(refusal: ComputeRefusal): number {
    const hint = refusal.retryAfterMs ?? BUSY_RETRY_DEFAULT_MS;
    const pause = Math.min(
      Math.max(hint, BUSY_RETRY_MIN_MS),
      BUSY_RETRY_MAX_MS,
    );
    return Math.min(pause, this.left);
  }
}
