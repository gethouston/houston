import type { WireFrame } from "@houston/runtime-client";
import {
  SEND_TURN_RUNNING_HOLD_MS,
  SEND_TURN_RUNNING_MAX_HOLD_MS,
  type StreamTuning,
} from "./stream-tuning";

/** Only agent frames or a running sync prove progress; idle syncs do not. */
export function turnProgressAt(frame: WireFrame): number | undefined {
  if (frame.type === "sync") return frame.data.running ? Date.now() : undefined;
  if (
    frame.type === "done" ||
    frame.type === "error" ||
    frame.type === "provider_error"
  )
    return undefined;
  return Date.now();
}

/** A silent claim gets the base hold; recent progress can extend it. */
export class SendHoldClock {
  private readonly started = Date.now();
  private readonly base: number;
  constructor(tuning?: StreamTuning) {
    this.base = tuning?.sendTurnRunningHoldMs ?? SEND_TURN_RUNNING_HOLD_MS;
  }
  left(lastProgressAt?: number): number {
    const due = Math.min(
      this.started + SEND_TURN_RUNNING_MAX_HOLD_MS,
      Math.max(this.started, lastProgressAt ?? this.started) + this.base,
    );
    return Math.max(0, due - Date.now());
  }
}
