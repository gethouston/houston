import type {
  RoutineAccountFailureCode,
  RoutineAutoPause,
} from "@houston/protocol";
import {
  failureCodeForReader,
  type RoutineReaderAccount,
} from "./failure-view";
import type { Routine } from "./types";

export type RoutinePauseRemedy =
  | "connect_account"
  | "reconnect_account"
  | "add_credits"
  | "change_model"
  | "choose_model";

export type RoutinePauseAccount = "creator" | "team";

interface PauseCounts {
  failures: number;
  pausedAt: string;
}

export type RoutinePauseNotice = PauseCounts &
  (
    | {
        remedy: Exclude<RoutinePauseRemedy, "choose_model">;
        account?: RoutinePauseAccount;
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
