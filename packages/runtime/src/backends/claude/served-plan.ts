import type { ClaudePlanBinding } from "../../auth/claude-plan";
import type { ClaudeToken } from "./backend-types";

export function withServedPlan(
  token: ClaudeToken | undefined,
  plan: ClaudePlanBinding | undefined,
): ClaudeToken | undefined {
  if (
    token?.kind !== "oauth-token" ||
    !plan ||
    token.accessDigest !== plan.accessDigest
  )
    return token;
  return { ...token, subscriptionType: plan.subscriptionType };
}
