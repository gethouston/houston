import type { WireFrame } from "@houston/runtime-client";
import type { TurnSetupError } from "./turn-layout";
import type { TurnOutcome } from "./turn-session";

/** Build the durable terminal frame after sync-back completes. */
export function turnTerminalFrame(
  outcome: TurnOutcome,
  turnId: string,
  poolWritesOutOfScope: number,
  transcriptSkipped?: "route_absent",
): WireFrame {
  const fields = {
    ...(poolWritesOutOfScope > 0 ? { poolWritesOutOfScope } : {}),
    ...(transcriptSkipped ? { transcriptSkipped } : {}),
  };
  const diagnostic = Object.keys(fields).length > 0 ? fields : undefined;
  if (outcome.error) {
    // SAFETY: pooled-turn diagnostics are an additive internal transport field;
    // public WireFrame consumers still receive the required error message.
    return {
      type: "error",
      data: { message: outcome.error, ...diagnostic },
      turnId,
    } as WireFrame;
  }
  // SAFETY: claimed-turn diagnostics intentionally widen this internal done
  // frame while preserving null for every ordinary public-protocol turn.
  return {
    type: "done",
    data: diagnostic ?? null,
    turnId,
    ...(outcome.pendingInteraction
      ? { pendingInteraction: outcome.pendingInteraction }
      : {}),
  } as unknown as WireFrame;
}

/** Build the internal typed error frame for pre-provider setup failures. */
export function turnSetupErrorFrame(
  error: TurnSetupError,
  turnId: string,
): WireFrame {
  // SAFETY: setup error codes are internal to the pool dispatcher and retain
  // the public error frame's required message field.
  return {
    type: "error",
    data: { message: error.code, code: error.code, detail: error.message },
    turnId,
  } as WireFrame;
}
