/**
 * How a routine's credential failure reads to the person looking at it.
 *
 * The engine records a run that found no credential as `*_not_connected`,
 * because from where it stands an account the gateway signed out looks
 * exactly like one never connected. The gateway knows the difference: when it
 * ended the login (a Claude subscription login reaches its end about 28 days
 * after the sign-in, or a provider revoked the token) it marks that provider
 * `needs_reconnect` on the reader's provider status. The remedy is then to
 * sign in again, so the failure reads as `*_needs_reconnect`.
 *
 * The reader's status describes THEIR OWN account, so it only speaks for a
 * failure on that same account: the creator's account when the reader created
 * the routine, and the space's single account when the reader's probe was
 * answered by it (any scope but "personal").
 */

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
  /** The reader created the routine. */
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

/** The failure code to present for `failure`, as `reader` can see it. */
export function routineFailureCode(
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
