import { TurnErrorCode } from "@houston/protocol";
import type { ClaimHeartbeat } from "./claim-heartbeat";
import type { TurnServerDeps } from "./server-types";
import type { changedEventTypes } from "./turn-changed-events";
import { appendDurabilityError } from "./turn-durability-error";
import { finishTurnDurabilityPass } from "./turn-durability-pass";
import type { TurnFilesystem } from "./turn-filesystem";
import type { TurnSandboxViews } from "./turn-sandbox";
import type { TurnOutcome } from "./turn-session";
import { writeTurnStopMarker } from "./turn-stop-marker";
import type { ResolvedTurnStore } from "./turn-store";
import type { TurnSyncReport } from "./turn-sync-report";
import type { TurnTranscript } from "./turn-transcript";
import type { TurnRequest } from "./types";

export interface TurnDurabilityOptions {
  deps: TurnServerDeps;
  turn: TurnRequest & { turnId: string };
  filesystem: TurnFilesystem;
  resolved: ResolvedTurnStore;
  heartbeat: ClaimHeartbeat | null;
  outcome: TurnOutcome;
  timings?: Record<string, number>;
  transcript: TurnTranscript | null;
  views?: TurnSandboxViews;
  afterSync?: (landed: readonly string[]) => Promise<string | undefined>;
}

export interface TurnDurabilityResult {
  outcome: TurnOutcome;
  poolWritesOutOfScope: number;
  changed: ReturnType<typeof changedEventTypes>;
  transcriptSkipped?: "route_absent";
  activityDocSkipped?: "route_absent";
  sync?: TurnSyncReport;
}

export async function finishTurnDurability(
  opts: TurnDurabilityOptions,
): Promise<TurnDurabilityResult> {
  await opts.heartbeat?.checkpoint();
  let outcome = opts.outcome;
  let transcript = opts.transcript;
  if (outcome.stopReason && !opts.heartbeat?.fenced) {
    const stopReason = transcript
      ? outcome.stopReason
      : TurnErrorCode.TimeLimitUnsaved;
    outcome = {
      ...outcome,
      stopReason,
      pendingInteraction: undefined,
    };
    try {
      await writeTurnStopMarker(opts, stopReason);
    } catch (error) {
      console.error("[turn] wind-down marker failed", error);
      const failure = `wind-down marker failed: ${error instanceof Error ? error.message : String(error)}`;
      outcome = {
        ...appendDurabilityError(outcome, failure),
        stopReason: TurnErrorCode.TimeLimitUnsaved,
      };
      transcript = null;
    }
  }
  return finishTurnDurabilityPass({ ...opts, outcome, transcript });
}
