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
  | "connect_account"
  | "reconnect_account"
  | "add_credits"
  | "change_model"
  | "choose_model";

/** Whose account the remedy is about. */
export type RoutinePauseAccount = "creator" | "team";

interface PauseCounts {
  failures: number;
  pausedAt: string;
}

export type RoutinePauseNotice = PauseCounts &
  (
    | {
        remedy: Exclude<RoutinePauseRemedy, "choose_model">;
        /** Present for the connect and reconnect remedies; the other two name no account. */
        account?: RoutinePauseAccount;
        /** The provider id the failed runs needed (e.g. "anthropic"). */
        provider: string;
      }
    | { remedy: "choose_model" }
  );

const REMEDY: Record<
  RoutineAccountFailureCode,
  {
    remedy: Exclude<RoutinePauseRemedy, "choose_model">;
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
  if (pause.cause === "no_model") return { remedy: "choose_model", ...counts };
  const reason = failureCodeForReader(
    { code: pause.reason, provider: pause.provider },
    reader,
  );
  const fix =
    reason === "no_model" || reason === "usage_limit"
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
