import { parseClaudeSubscriptionType } from "../auth/claude-plan";
import type { TurnCredential } from "./types";

/** The turn envelope's served credential; null/absent = not connected. */
export function parseTurnCredential(value: unknown): TurnCredential | null {
  if (value == null) return null;
  const c = value as Record<string, unknown>;
  if (
    typeof c.provider !== "string" ||
    typeof c.access !== "string" ||
    typeof c.expires !== "number"
  ) {
    throw new Error("invalid 'credential'");
  }
  // A plan the CLI would not recognize is dropped, never rejected: the
  // gateway may learn a new one before this worker does.
  const subscriptionType = parseClaudeSubscriptionType(c.subscriptionType);
  return {
    provider: c.provider,
    access: c.access,
    expires: c.expires,
    accountId: typeof c.accountId === "string" ? c.accountId : null,
    kind: c.kind === "api_key" ? "api_key" : "oauth",
    // Copilot Enterprise routes to a per-tenant API host; dropping it here
    // would silently turn an enterprise credential into a github.com one.
    ...(typeof c.enterpriseUrl === "string" && c.enterpriseUrl
      ? { enterpriseUrl: c.enterpriseUrl }
      : {}),
    ...(c.scope === "personal" || c.scope === "team" ? { scope: c.scope } : {}),
    ...(c.health === "needs_reconnect" || c.health === "out_of_credits"
      ? { health: c.health }
      : {}),
    ...(subscriptionType ? { subscriptionType } : {}),
  };
}
