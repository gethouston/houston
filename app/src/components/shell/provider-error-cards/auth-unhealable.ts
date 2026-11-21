import type { ProviderError } from "@houston-ai/chat";
import type { AuthCardPresentation } from "./auth-presentation.ts";

type UnauthCause = Extract<ProviderError, { kind: "unauthenticated" }>["cause"];

const K = "providerError.unauthenticated";

export type UnhealableCause = Extract<
  UnauthCause,
  "org_policy_blocked" | "billing_locked"
>;

export function unhealableCause(
  cause: UnauthCause,
): UnhealableCause | undefined {
  return cause === "org_policy_blocked" || cause === "billing_locked"
    ? cause
    : undefined;
}

export function unhealablePresentation(
  cause: UnhealableCause,
): AuthCardPresentation {
  if (cause === "org_policy_blocked") {
    return {
      variant: "active",
      titleKey: `${K}.titleOrgPolicy`,
      bodyKey: `${K}.bodyOrgPolicyBlocked`,
      button: {
        kind: "action",
        labelKey: `${K}.useApiKey`,
        action: "open_ai_hub",
      },
    };
  }
  return {
    variant: "active",
    titleKey: `${K}.titleBillingLocked`,
    bodyKey: `${K}.bodyBillingLocked`,
    button: {
      kind: "action",
      labelKey: `${K}.chooseAnotherAi`,
      action: "open_ai_hub",
    },
  };
}
