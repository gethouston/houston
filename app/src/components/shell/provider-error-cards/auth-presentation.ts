import type { ProviderError } from "@houston-ai/chat";
import {
  type UnhealableCause,
  unhealablePresentation,
} from "./auth-unhealable.ts";

export type LoginPhase = "idle" | "waiting" | "done" | "failed";

type UnauthCause = Extract<ProviderError, { kind: "unauthenticated" }>["cause"];

const K = "providerError.unauthenticated";

export function authCauseBodyKey(cause: UnauthCause): string {
  switch (cause) {
    case "token_expired":
      return `${K}.bodyTokenExpired`;
    case "no_credentials":
      return `${K}.bodyNoCredentials`;
    case "invalid_api_key":
      return `${K}.bodyInvalidApiKey`;
    case "token_revoked":
      return `${K}.bodyTokenRevoked`;
    case "org_policy_blocked":
      return `${K}.bodyOrgPolicyBlocked`;
    case "billing_locked":
      return `${K}.bodyBillingLocked`;
    default:
      return `${K}.bodyUnknown`;
  }
}

export type AuthCardAction = "reconnect" | "cancel" | "open_ai_hub";

export type AuthCardButton =
  | { kind: "action"; labelKey: string; action: AuthCardAction }
  | { kind: "badge"; labelKey: string }
  | null;

export interface AuthCardPresentation {
  variant: "done" | "active";
  titleKey: string;
  bodyKey: string;
  button: AuthCardButton;
}

function donePresentation(args: {
  titleKey: string;
  hasFailedPrompt: boolean;
  hasRetry: boolean;
}): AuthCardPresentation {
  const { titleKey, hasFailedPrompt, hasRetry } = args;

  if (hasFailedPrompt) {
    return {
      variant: "done",
      titleKey,
      bodyKey: `${K}.reconnectedResending`,
      button: { kind: "badge", labelKey: `${K}.signedIn` },
    };
  }
  if (hasRetry) {
    return {
      variant: "done",
      titleKey,
      bodyKey: `${K}.reconnectedResuming`,
      button: { kind: "badge", labelKey: `${K}.signedIn` },
    };
  }
  return {
    variant: "done",
    titleKey,
    bodyKey: `${K}.reconnectedBody`,
    button: null,
  };
}

export function resolveAuthCardPresentation(args: {
  phase: LoginPhase;
  hasProvider: boolean;
  hasFailedPrompt: boolean;
  hasRetry: boolean;
  causeBodyKey: string;
  unhealable?: UnhealableCause;
}): AuthCardPresentation {
  const { phase, hasProvider, hasFailedPrompt, hasRetry, causeBodyKey } = args;

  if (!hasProvider) {
    if (phase === "done") {
      return donePresentation({
        titleKey: `${K}.reconnectedTitleGeneric`,
        hasFailedPrompt,
        hasRetry,
      });
    }
    return {
      variant: "active",
      titleKey: `${K}.titleGeneric`,
      bodyKey: `${K}.bodyGeneric`,
      button: {
        kind: "action",
        labelKey: `${K}.connectProvider`,
        action: "reconnect",
      },
    };
  }

  if (phase === "done") {
    return donePresentation({
      titleKey: `${K}.reconnectedTitle`,
      hasFailedPrompt,
      hasRetry,
    });
  }

  if (args.unhealable) return unhealablePresentation(args.unhealable);

  if (phase === "waiting") {
    return {
      variant: "active",
      titleKey: `${K}.title`,
      bodyKey: `${K}.waiting`,
      button: {
        kind: "action",
        labelKey: "common:actions.cancel",
        action: "cancel",
      },
    };
  }

  if (phase === "failed") {
    return {
      variant: "active",
      titleKey: `${K}.title`,
      bodyKey: `${K}.failedBody`,
      button: {
        kind: "action",
        labelKey: `${K}.reconnect`,
        action: "reconnect",
      },
    };
  }

  return {
    variant: "active",
    titleKey: `${K}.title`,
    bodyKey: causeBodyKey,
    button: { kind: "action", labelKey: `${K}.reconnect`, action: "reconnect" },
  };
}
