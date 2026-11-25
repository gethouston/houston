import type { ProviderError, RoutineRunFailure } from "@houston/protocol";
import { TurnFireError } from "../channel/fire-error";
import { sentenceProviderName } from "../providers";

// The classification is pure and shared with the pooled worker's settle.
export { routineRunFailure } from "@houston/domain";

/**
 * Why a routine run failed, in the terms the person reading its history can
 * act on (PRODUCT-1475). A routine fires on the CREATOR's credential scope, so
 * "no provider connected" is never the whole truth: the reader may well have
 * their own account connected and still see the run fail, which is exactly the
 * report that made this bug look like a lie on screen.
 *
 * The typed code drives whatever the surface wants to render; `summary` stays
 * an honest English sentence for the surfaces (and the run history) that show
 * it verbatim, matching the existing run-row copy.
 */

/**
 * The runtime refused the fire because nothing usable is connected for the
 * identity the routine runs as. Not transient: the next fire fails the same
 * way until a person connects an account or picks a model.
 */
export function isUnconnectedRefusal(err: unknown): err is TurnFireError {
  return err instanceof TurnFireError && err.code === "no_provider";
}

/** The run-row sentence for a typed failure. */
export function routineRunFailureSummary(
  failure: Exclude<RoutineRunFailure, { code: "provider_error" }>,
): string {
  if (failure.code === "no_model")
    return "This routine has no model chosen, and the AI account it would use isn't connected.";
  const name = sentenceProviderName(failure.provider);
  switch (failure.code) {
    case "creator_not_connected":
      return `The routine's creator has no ${name} account connected.`;
    case "team_not_connected":
      return `This team has no ${name} account connected.`;
    case "creator_needs_reconnect":
      return `${name} needs to be reconnected by the routine's creator.`;
    case "team_needs_reconnect":
      return `${name} needs to be reconnected for this team.`;
    case "out_of_credits":
      return `The ${name} account is out of credits.`;
    case "model_unavailable":
      return `The ${name} account can't use the model this routine runs on.`;
    case "usage_limit":
      // The reset instant is left to the surface, which knows the reader's
      // zone and language; this sentence is the history's verbatim fallback.
      return `The ${name} plan reached its usage limit for this routine's model. Runs continue when the limit resets.`;
  }
}

/** A run-row-sized reason from a turn's typed provider failure that is NOT a
 *  credential wall (an outage, a rate limit): the provider's own words. */
export function providerErrorSummary(err: ProviderError): string {
  const text = err.kind === "unknown" ? err.raw_excerpt : err.message;
  return text.trim() || `provider error (${err.kind})`;
}

export function routineRunErrorSummary(
  failure: RoutineRunFailure | undefined,
  err: ProviderError,
): string {
  return failure && failure.code !== "provider_error"
    ? routineRunFailureSummary(failure)
    : providerErrorSummary(err);
}
