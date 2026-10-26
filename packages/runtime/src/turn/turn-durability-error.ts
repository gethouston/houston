import type { TurnOutcome } from "./turn-session";

export function appendDurabilityError(
  outcome: TurnOutcome,
  error: string,
): TurnOutcome {
  return {
    ...outcome,
    error: outcome.error ? `${outcome.error}; ${error}` : error,
  };
}
