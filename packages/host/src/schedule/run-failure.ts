import type {
  ProviderError,
  RoutineRunFailure,
  RoutineRunFailureCode,
} from "@houston/protocol";
import { providerName } from "../providers";

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
 * The provider name for a SENTENCE. The catalog names carry a plan
 * parenthetical ("Claude (Pro / Max)") which reads wrong mid-sentence, so it
 * is dropped here and only here — the catalog stays the source of truth for
 * every place a provider is NAMED rather than narrated.
 */
function sentenceProviderName(id: string): string {
  return providerName(id).replace(/\s*\(.*\)\s*$/, "");
}

/**
 * Whose credential ran the failed turn. A turn with no acting identity has
 * exactly one credential and it is the creator's own (desktop, self-host, a
 * personal space), so absence reads as personal — never as "the team's".
 */
function isTeamCredential(err: ProviderError): boolean {
  return err.credential?.scope === "team";
}

/** The typed failure for a turn's provider error, or undefined when the error
 *  is not a credential-level wall (a network blip, a provider outage). */
export function routineRunFailure(
  err: ProviderError,
): RoutineRunFailure | undefined {
  if (err.kind === "quota_exhausted")
    return { code: "out_of_credits", provider: err.provider };
  if (err.kind !== "unauthenticated") return undefined;
  const team = isTeamCredential(err);
  const code: RoutineRunFailureCode =
    err.cause === "no_credentials"
      ? team
        ? "team_not_connected"
        : "creator_not_connected"
      : team
        ? "team_needs_reconnect"
        : "creator_needs_reconnect";
  return { code, provider: err.provider };
}

/** The run-row sentence for a typed failure. */
export function routineRunFailureSummary(failure: RoutineRunFailure): string {
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
  }
}

/** A run-row-sized reason from a turn's typed provider failure that is NOT a
 *  credential wall (an outage, a rate limit): the provider's own words. */
export function providerErrorSummary(err: ProviderError): string {
  const text = err.kind === "unknown" ? err.raw_excerpt : err.message;
  return text.trim() || `provider error (${err.kind})`;
}
