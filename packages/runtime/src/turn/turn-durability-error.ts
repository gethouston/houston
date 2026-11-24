import type { TurnDurabilityResult } from "./turn-durability";
import type { TurnOutcome } from "./turn-session";
import type { TurnSyncReport } from "./turn-sync-report";

export function appendDurabilityError(
  outcome: TurnOutcome,
  error: string,
): TurnOutcome {
  return {
    ...outcome,
    error: outcome.error ? `${outcome.error}; ${error}` : error,
  };
}

export const claimFenced = (
  poolWritesOutOfScope = 0,
  changed: TurnDurabilityResult["changed"] = [],
  sync?: TurnSyncReport,
): TurnDurabilityResult => ({
  outcome: { error: "claim_fenced" },
  poolWritesOutOfScope,
  changed,
  ...(sync ? { sync } : {}),
});
