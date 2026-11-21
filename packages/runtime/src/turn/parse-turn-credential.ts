import { parseClaudeSubscriptionType } from "../auth/claude-plan";
import type { TurnCredential } from "./types";

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
  const subscriptionType = parseClaudeSubscriptionType(c.subscriptionType);
  return {
    provider: c.provider,
    access: c.access,
    expires: c.expires,
    accountId: typeof c.accountId === "string" ? c.accountId : null,
    kind: c.kind === "api_key" ? "api_key" : "oauth",
    ...(typeof c.enterpriseUrl === "string" && c.enterpriseUrl
      ? { enterpriseUrl: c.enterpriseUrl }
      : {}),
    ...(subscriptionType ? { subscriptionType } : {}),
  };
}
