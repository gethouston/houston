import type { WireFrame } from "@houston/runtime-client";
import type { TurnSetupError } from "./turn-layout";
import type { TurnOutcome } from "./turn-session";

/**
 * Build the durable terminal frame after sync-back completes. `changed` lists
 * the domain events the landed writes imply; the gateway fans them out to
 * every member's /v1/events, the pod-event parity for a worker-run turn. It
 * rides the error frame too: a provider failure after a durable tool write
 * still changed what other tabs show.
 */
/** performance.now() marks → whole-ms deltas from the earliest mark. */
function timingDeltas(
  marks: Record<string, number> | undefined,
): Record<string, number> | undefined {
  const entries = Object.entries(marks ?? {});
  if (entries.length === 0) return undefined;
  const base = Math.min(...entries.map(([, v]) => v));
  return Object.fromEntries(
    entries.map(([k, v]) => [k.replace(/^t_/, ""), Math.round(v - base)]),
  );
}

export function turnTerminalFrame(
  outcome: TurnOutcome,
  turnId: string,
  poolWritesOutOfScope: number,
  transcriptSkipped?: "route_absent",
  activityDocSkipped?: "route_absent",
  changed: readonly string[] = [],
  timings?: Record<string, number>,
  hydration?: { hydratedObjects: number; skippedObjects: number },
): WireFrame {
  const timingsMs = timingDeltas(timings);
  const fields = {
    ...(timingsMs ? { timingsMs } : {}),
    ...(changed.length > 0 ? { changed } : {}),
    ...(poolWritesOutOfScope > 0 ? { poolWritesOutOfScope } : {}),
    ...(transcriptSkipped ? { transcriptSkipped } : {}),
    ...(activityDocSkipped ? { activityDocSkipped } : {}),
    ...hydration,
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
