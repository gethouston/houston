import type { ProviderError } from "@houston-ai/chat";

/**
 * Pure state -> presentation mapping for the inline `UnauthenticatedCard`.
 *
 * The card is a 4-phase machine (`idle | waiting | done | failed`). Its labels
 * carried two OPPOSITE meanings under one "Try again" string, so the mapping is
 * pulled out here where every phase can be asserted without mounting React. The
 * component keeps ALL side effects (launchLogin, cancel, resend) and only reads
 * the keys + action tag this returns.
 */

export type LoginPhase = "idle" | "waiting" | "done" | "failed";

type UnauthCause = Extract<ProviderError, { kind: "unauthenticated" }>["cause"];

const K = "providerError.unauthenticated";

/** Every auth-failure cause maps to a body key so the card always names a reason. */
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
    default:
      return `${K}.bodyUnknown`;
  }
}

/** The action a button fires. A `badge` button is a disabled status pill. */
export type AuthCardAction = "reconnect" | "cancel" | "sendAgain";

export type AuthCardButton =
  | { kind: "action"; labelKey: string; action: AuthCardAction }
  | { kind: "badge"; labelKey: string }
  | null;

export interface AuthCardPresentation {
  /** `done` = green confirmation card; `active` = the provider-glyph card. */
  variant: "done" | "active";
  titleKey: string;
  bodyKey: string;
  button: AuthCardButton;
}

/**
 * Resolve the card's title/body/button from its phase.
 *
 * - `done` + a refused send (`hasFailedPrompt`): the resend already fired, so
 *   the pill is a disabled "Signed in" badge.
 * - `done`, mid-turn failure: an explicit "Send my message" button (only when
 *   the card can resend — `hasRetry`).
 * - `waiting`: the wait is on the user's browser, so the action is Cancel.
 * - `failed` / `idle`: the Reconnect button relaunches sign-in.
 */
export function resolveAuthCardPresentation(args: {
  phase: LoginPhase;
  hasFailedPrompt: boolean;
  hasRetry: boolean;
  causeBodyKey: string;
}): AuthCardPresentation {
  const { phase, hasFailedPrompt, hasRetry, causeBodyKey } = args;

  if (phase === "done") {
    if (hasFailedPrompt) {
      return {
        variant: "done",
        titleKey: `${K}.reconnectedTitle`,
        bodyKey: `${K}.reconnectedResending`,
        button: { kind: "badge", labelKey: `${K}.signedIn` },
      };
    }
    return {
      variant: "done",
      titleKey: `${K}.reconnectedTitle`,
      bodyKey: `${K}.reconnectedBody`,
      button: hasRetry
        ? { kind: "action", labelKey: `${K}.sendAgain`, action: "sendAgain" }
        : null,
    };
  }

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
