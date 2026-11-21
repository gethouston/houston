import { isPersonalClaudePlan } from "../../auth/claude-plan";
import type { ClaudeToken } from "./backend-types";

export function tokenEnv(
  token: ClaudeToken | undefined,
): Record<string, string> {
  if (token?.kind === "oauth-token")
    return {
      CLAUDE_CODE_OAUTH_TOKEN: token.value,
      ...(isPersonalClaudePlan(token.subscriptionType)
        ? { CLAUDE_CODE_SUBSCRIPTION_TYPE: token.subscriptionType }
        : {}),
    };
  if (token?.kind === "api-key") return { ANTHROPIC_API_KEY: token.value };
  return {};
}
