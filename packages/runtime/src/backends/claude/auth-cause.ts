import type { AuthFailureCause } from "@houston/runtime-client";

export function authCause(lower: string): AuthFailureCause {
  if (
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("incorrect api key")
  )
    return "invalid_api_key";
  if (
    lower.includes("revoked") ||
    lower.includes("session has ended") ||
    lower.includes("session terminated") ||
    lower.includes("log in again")
  )
    return "token_revoked";
  if (lower.includes("expired")) return "token_expired";
  return "unknown";
}
