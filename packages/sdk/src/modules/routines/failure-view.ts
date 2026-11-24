import type {
  ProviderHealth,
  RoutineRunFailure,
  RoutineRunFailureCode,
} from "@houston/protocol";

/** What the reader's own account says about one provider. */
export interface RoutineReaderAccount {
  provider: string;
  /** Live health of the reader's own account for `provider`. */
  health?: ProviderHealth;
  /** Whose credential answered the reader's probe; absent = the only one. */
  credentialScope?: "personal" | "team";
  readerIsCreator: boolean;
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
  if (failure.code === "no_model") return failure.code;
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
