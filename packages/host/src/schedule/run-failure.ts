import type { ProviderError, RoutineRunFailure } from "@houston/protocol";
import { TurnFireError } from "../channel/fire-error";
import { sentenceProviderName } from "../providers";

export { routineRunFailure } from "@houston/domain";

export function isUnconnectedRefusal(err: unknown): err is TurnFireError {
  return err instanceof TurnFireError && err.code === "no_provider";
}

export function routineRunFailureSummary(failure: RoutineRunFailure): string {
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
      return `The ${name} plan reached its usage limit for this routine's model. Runs continue when the limit resets.`;
  }
}

export function providerErrorSummary(err: ProviderError): string {
  const text = err.kind === "unknown" ? err.raw_excerpt : err.message;
  return text.trim() || `provider error (${err.kind})`;
}
