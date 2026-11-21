type RoutineRunFailureCode =
  | "creator_not_connected"
  | "team_not_connected"
  | "creator_needs_reconnect"
  | "team_needs_reconnect"
  | "out_of_credits"
  | "model_unavailable";
type RoutineDeliveryFailureCode = "pool_delivery_expired";
interface RoutineRunFailure {
  code: RoutineRunFailureCode;
  provider: string;
}
interface RoutineAutoPause {
  reason: RoutineRunFailureCode;
  provider: string;
  failures: number;
  at: string;
}
interface Routine {
  enabled: boolean;
}
interface RoutineRun {
  delivery_failure?: { code: RoutineDeliveryFailureCode };
  failure?: RoutineRunFailure;
}
interface RoutineReaderAccount {
  provider: string;
  health?: string;
  credentialScope?: "personal" | "team";
  readerIsCreator: boolean;
}
type RoutinePauseRemedy =
  | "connect_account"
  | "reconnect_account"
  | "add_credits"
  | "change_model";
type RoutinePauseAccount = "creator" | "team";
interface RoutinePauseNotice {
  remedy: RoutinePauseRemedy;
  account?: RoutinePauseAccount;
  provider: string;
  failures: number;
  pausedAt: string;
}

const SIGNED_OUT: Partial<
  Record<
    RoutineRunFailureCode,
    { as: RoutineRunFailureCode; account: "creator" | "team" }
  >
> = {
  creator_not_connected: { as: "creator_needs_reconnect", account: "creator" },
  team_not_connected: { as: "team_needs_reconnect", account: "team" },
};

export function failureCodeForReader(
  failure: RoutineRunFailure,
  reader?: RoutineReaderAccount,
): RoutineRunFailureCode {
  const signedOut = SIGNED_OUT[failure.code];
  if (
    !signedOut ||
    !reader ||
    reader.provider !== failure.provider ||
    reader.health !== "needs_reconnect"
  )
    return failure.code;
  const sameAccount =
    signedOut.account === "creator"
      ? reader.readerIsCreator
      : reader.credentialScope !== "personal";
  return sameAccount ? signedOut.as : failure.code;
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

export function routinePauseNotice(
  routine: Pick<Routine, "enabled"> & { auto_paused?: RoutineAutoPause },
  reader?: RoutineReaderAccount,
): RoutinePauseNotice | null {
  const pause = routine.auto_paused;
  if (routine.enabled || !pause) return null;
  const reason = failureCodeForReader(
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

export function routineFailureCode(
  run: Pick<RoutineRun, "delivery_failure" | "failure">,
  readerFor?: (provider: string) => RoutineReaderAccount,
): RoutineDeliveryFailureCode | RoutineRunFailureCode | undefined {
  if (run.delivery_failure) return run.delivery_failure.code;
  if (!run.failure) return undefined;
  return failureCodeForReader(run.failure, readerFor?.(run.failure.provider));
}
