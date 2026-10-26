import { type ModelCallReport, TurnErrorCode } from "@houston/protocol";
import type { WireFrame } from "@houston/runtime-client";
import type { TurnDurabilityResult } from "./turn-durability";
import type { TurnSetupCode, TurnSetupError } from "./turn-layout";
import type { MissionTitleReport } from "./turn-mission-title-outcome";
import type { TurnOutcome } from "./turn-session";
import type { TurnSyncReport } from "./turn-sync-report";

/** Per-turn diagnostics that ride the terminal frame beside `changed`. */
export interface TurnTerminalDiagnostics {
  missionTitle?: MissionTitleReport;
  sync?: TurnSyncReport;
  modelCalls?: ModelCallReport;
}

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
  extra: TurnTerminalDiagnostics = {},
): WireFrame {
  const timingsMs = timingDeltas(timings);
  const { missionTitle, sync, modelCalls } = extra;
  // The worker's pre-prompt cost is its own request-to-prompt span: the
  // earliest mark is the request's arrival.
  const prePrompt = timingsMs?.prompt_start;
  const fields = {
    ...(timingsMs ? { timingsMs } : {}),
    ...(changed.length > 0 ? { changed } : {}),
    ...(poolWritesOutOfScope > 0 ? { poolWritesOutOfScope } : {}),
    ...(transcriptSkipped ? { transcriptSkipped } : {}),
    ...(activityDocSkipped ? { activityDocSkipped } : {}),
    ...hydration,
    ...(missionTitle ? { missionTitle } : {}),
    ...(sync?.incomplete ? { syncIncomplete: sync.incomplete } : {}),
    ...(sync?.merges ? { syncMerges: sync.merges } : {}),
    ...(modelCalls
      ? {
          modelCalls:
            prePrompt === undefined
              ? modelCalls
              : {
                  ...modelCalls,
                  startupMs: { ...modelCalls.startupMs, pre_prompt: prePrompt },
                },
        }
      : {}),
  };
  const diagnostic = Object.keys(fields).length > 0 ? fields : undefined;
  if (
    outcome.error &&
    (!outcome.stopReason || outcome.error === "claim_fenced")
  ) {
    // SAFETY: pooled-turn diagnostics are an additive internal transport field;
    // public WireFrame consumers still receive the required error message.
    return {
      type: "error",
      data: { message: outcome.error, ...diagnostic },
      turnId,
    } as WireFrame;
  }
  if (outcome.stopReason) {
    const code = outcome.stopReason;
    if (outcome.error)
      console.error("[turn] wind-down durability failed", outcome.error);
    console.info("[turn] wind_down", {
      turnId,
      stopReason: code,
      stopToTerminalMs: Math.round(
        (timings?.t_terminal ?? performance.now()) -
          (timings?.t_stop_received ?? performance.now()),
      ),
      syncMs: Math.round(
        (timings?.t_sync_done ?? 0) - (timings?.t_sync_start ?? 0),
      ),
    });
    return {
      type: "error",
      data: {
        message:
          code === TurnErrorCode.TimeLimitUnsaved
            ? "This reply reached the 4-hour limit for one turn and stopped before it could save its last steps. Say continue to pick up from the last saved point."
            : "This reply reached the 4-hour limit for one turn. Say continue and the agent picks up from what it saved.",
        code,
        ...diagnostic,
      },
      turnId,
    };
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

/** The terminal frame of a turn whose durability pass ran. */
export function durableTerminalFrame(
  durable: TurnDurabilityResult,
  turnId: string,
  timings: Record<string, number>,
  hydration: { hydratedObjects: number; skippedObjects: number },
  missionTitle?: MissionTitleReport,
  modelCalls?: ModelCallReport,
): WireFrame {
  return turnTerminalFrame(
    durable.outcome,
    turnId,
    durable.poolWritesOutOfScope,
    durable.transcriptSkipped,
    durable.activityDocSkipped,
    durable.changed,
    timings,
    hydration,
    {
      ...(missionTitle ? { missionTitle } : {}),
      ...(durable.sync ? { sync: durable.sync } : {}),
      ...(modelCalls ? { modelCalls } : {}),
    },
  );
}

/**
 * The setup frame's `message`, per code. A client that knows no setup code
 * shows it verbatim, and cloud's mission watcher stores it as a mission's
 * error, so each line is accurate for its code and never the bare code
 * (H-003). Retry advice only where a retry can help.
 */
export const TURN_SETUP_MESSAGES: Record<TurnSetupCode, string> = {
  hydrate_over_cap: "This agent has too much saved to start right now.",
  layout_unexpected:
    "Your agent couldn't get ready for this message. Send it again in a moment.",
  agent_not_migrated:
    "Your agent is finishing an update. Send your message again in a moment.",
  message_refused:
    "This message couldn't be accepted. Send it again as a new message.",
  credential_write_failed:
    "Your agent couldn't connect to its AI provider for this message. Send it again in a moment.",
};

/** Build the internal typed error frame for pre-provider setup failures. */
export function turnSetupErrorFrame(
  error: TurnSetupError,
  turnId: string,
): WireFrame {
  // SAFETY: setup error codes are internal to the pool dispatcher and retain
  // the public error frame's required message field. The gateway's code
  // readers and the SDK key on `code`; mission records keep the message.
  return {
    type: "error",
    data: {
      message: TURN_SETUP_MESSAGES[error.code],
      code: error.code,
      detail: error.message,
    },
    turnId,
  } as WireFrame;
}
