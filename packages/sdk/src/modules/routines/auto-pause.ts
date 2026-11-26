/**
 * What a surface says about a routine the engine paused by itself (the host
 * writes `Routine.auto_paused` after the same account or model problem failed
 * its latest runs in a row). The engine only records WHY; which fix to offer,
 * and whose account it is, is decided here once so desktop, web and the AI
 * Manager all tell the person the same thing. Resuming is the ordinary
 * `updateRoutine(agentId, id, { enabled: true })`, which clears the pause.
 */

import type {
  RoutineAccountFailureCode,
  RoutineAutoPause,
} from "@houston/protocol";
import {
  failureCodeForReader,
  type RoutineReaderAccount,
} from "./failure-view";
import type { Routine } from "./types";

/** The one thing a person does before resuming an auto-paused routine. */
export type RoutinePauseRemedy =
  /** No account for the provider: connect one. */
  | "connect_account"
  /** The account's login lapsed or was refused: sign in again. */
  | "reconnect_account"
  /** The account works but has no credits left: add some or change plan. */
  | "add_credits"
  /** The account cannot run the routine's model: pick another model. */
  | "change_model"
  /** The routine names no model and nothing it could fall back on is
   *  connected: choose a model for it. */
  | "choose_model"
  | "check_runs";

/** Whose account the remedy is about. */
export type RoutinePauseAccount = "creator" | "team";

interface PauseCounts {
  /** How many runs in a row failed before the pause. */
  failures: number;
  /** ISO time of the pause. */
  pausedAt: string;
}

export type RoutinePauseNotice = PauseCounts &
  (
    | {
        remedy: Exclude<RoutinePauseRemedy, "choose_model" | "check_runs">;
        /** Present for the connect and reconnect remedies; the other two name no account. */
        account?: RoutinePauseAccount;
        /** The provider id the failed runs needed (e.g. "anthropic"). */
        provider: string;
      }
    /** The routine has no model to name a provider for. */
    | { remedy: "choose_model" }
    | { remedy: "check_runs"; provider: string }
  );

const REMEDY: Record<
  RoutineAccountFailureCode,
  {
    remedy: Exclude<RoutinePauseRemedy, "choose_model" | "check_runs">;
    account?: RoutinePauseAccount;
  }
> = {
  creator_not_connected: { remedy: "connect_account", account: "creator" },
  team_not_connected: { remedy: "connect_account", account: "team" },
  creator_needs_reconnect: { remedy: "reconnect_account", account: "creator" },
  team_needs_reconnect: { remedy: "reconnect_account", account: "team" },
  out_of_credits: { remedy: "add_credits" },
  model_unavailable: { remedy: "change_model" },
};

/**
 * The notice for an auto-paused routine, or null when the routine is running
 * or a person paused it (a hand pause carries no reason and needs no notice).
 * `reader` is what the reader's own account says about the pause's provider:
 * a "not connected" pause on an account the gateway signed out asks to sign
 * in again (`./failure-view`).
 */
export function routinePauseNotice(
  routine: Pick<Routine, "enabled"> & { auto_paused?: RoutineAutoPause },
  reader?: RoutineReaderAccount,
): RoutinePauseNotice | null {
  const pause = routine.auto_paused;
  if (routine.enabled || !pause) return null;
  const counts = { failures: pause.failures, pausedAt: pause.at };
  // Read before `reason`: a no-model pause carries an account reason only so
  // older clients can render it (`RoutineAutoPause.cause`).
  if (pause.cause === "no_model") return { remedy: "choose_model", ...counts };
  if (pause.cause === "provider_error")
    return { remedy: "check_runs", provider: pause.provider, ...counts };
  const reason = failureCodeForReader(
    { code: pause.reason, provider: pause.provider },
    reader,
  );
  // A host newer than this client may record a reason it has no fix for:
  // reading it as no notice beats a screen that throws. A usage limit is
  // never a pause reason (it snoozes, `./snooze`), so it has no remedy here.
  const fix =
    reason === "no_model" ||
    reason === "usage_limit" ||
    reason === "provider_error"
      ? undefined
      : REMEDY[reason];
  if (!fix) return null;
  return {
    remedy: fix.remedy,
    ...(fix.account ? { account: fix.account } : {}),
    provider: pause.provider,
    ...counts,
  };
}
