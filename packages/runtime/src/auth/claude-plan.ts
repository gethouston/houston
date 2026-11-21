import { accessDigest } from "@houston/protocol/access-digest";

export const CLAUDE_SUBSCRIPTION_TYPES = [
  "pro",
  "max",
  "team",
  "enterprise",
] as const;

export type ClaudeSubscriptionType = (typeof CLAUDE_SUBSCRIPTION_TYPES)[number];

export function parseClaudeSubscriptionType(
  value: unknown,
): ClaudeSubscriptionType | undefined {
  return CLAUDE_SUBSCRIPTION_TYPES.find((plan) => plan === value);
}

export function isPersonalClaudePlan(
  plan: ClaudeSubscriptionType | undefined,
): plan is "pro" | "max" {
  return plan === "pro" || plan === "max";
}

export interface ClaudePlanBinding {
  accessDigest: string;
  subscriptionType: ClaudeSubscriptionType;
}

export function claudePlanBinding(
  credential:
    | {
        provider: string;
        access: string;
        kind?: "oauth" | "api_key";
        subscriptionType?: ClaudeSubscriptionType;
      }
    | null
    | undefined,
): ClaudePlanBinding | undefined {
  if (
    credential?.provider !== "anthropic" ||
    credential.kind === "api_key" ||
    !credential.subscriptionType
  )
    return undefined;
  return {
    accessDigest: accessDigest(credential.access),
    subscriptionType: credential.subscriptionType,
  };
}
