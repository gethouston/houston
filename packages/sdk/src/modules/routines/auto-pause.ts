/**
 * What a surface says about a routine the engine paused by itself (the host
 * writes `Routine.auto_paused` after the same account or model problem failed
 * its latest runs in a row). The engine only records WHY; which fix to offer,
 * and whose account it is, is decided here once so desktop, web and the AI
 * Manager all tell the person the same thing. Resuming is the ordinary
 * `updateRoutine(agentId, id, { enabled: true })`, which clears the pause.
 */

import type {
  RoutineAutoPause,
  RoutineRunFailureCode,
} from "@houston/protocol";
import { type RoutineReaderAccount, routineFailureCode } from "./failure-view";
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
  | "change_model";

/** Whose account the remedy is about. */
export type RoutinePauseAccount = "creator" | "team";

export interface RoutinePauseNotice {
  remedy: RoutinePauseRemedy;
  /** Present for the connect and reconnect remedies; the other two name no account. */
  account?: RoutinePauseAccount;
  /** The provider id the failed runs needed (e.g. "anthropic"). */
  provider: string;
  /** How many runs in a row failed before the pause. */
  failures: number;
  /** ISO time of the pause. */
  pausedAt: string;
}

const REMEDY: Record<
  RoutineRunFailureCode,
  { remedy: RoutinePauseRemedy; account?: RoutinePauseAccount }
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
  const reason = routineFailureCode(
    { code: pause.reason, provider: pause.provider },
    reader,
  );
  const { remedy, account } = REMEDY[reason];
  return {
    remedy,
    ...(account ? { account } : {}),
    provider: pause.provider,
    failures: pause.failures,
    pausedAt: pause.at,
  };
}
