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
    case "org_policy_blocked":
      return `${K}.bodyOrgPolicyBlocked`;
    default:
      return `${K}.bodyUnknown`;
  }
}

/**
 * The action a button fires. A `badge` button is a disabled status pill.
 * `open_ai_hub` navigates to the AI Hub instead of launching a sign-in — the
 * org-policy card's action, because reconnecting cannot heal that failure and
 * the remedy (an API key) lives on the AI Hub's connect surfaces.
 */
export type AuthCardAction = "reconnect" | "cancel" | "open_ai_hub";

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
 * The `done` phase, parameterised by its title only: the bodies never name a
 * provider, so the generic (unknown-provider) card reuses them verbatim and
 * differs solely in the title it confirms with.
 */
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

/**
 * Resolve the card's title/body/button from its phase.
 *
 * - `hasProvider: false`: the error named no provider (nothing is connected at
 *   all), so EVERY provider-named string is off the table — `{{provider}}`
 *   would interpolate to an empty string, and the old guess ("anthropic") lied.
 *   The card becomes a generic "connect an AI provider" prompt whose action
 *   opens the AI Hub instead of a sign-in that cannot be launched.
 * - `done` with a retry handler: the resume already auto-fired, so the pill
 *   is a disabled "Signed in" badge. The body says what resumed: the refused
 *   send's message (`hasFailedPrompt`) or the interrupted task.
 * - `done` without a retry handler: nothing to resume — plain confirmation.
 * - `waiting`: the wait is on the user's browser, so the action is Cancel.
 * - `failed` / `idle`: the Reconnect button relaunches sign-in.
 * - `orgPolicyBlocked` (idle / failed): the provider's org policy blocked
 *   subscription access — reconnecting can only fail the same way, so the
 *   card never offers it. The action opens the AI Hub, where the user can
 *   connect with an API key instead (PRODUCT-1393). A later successful
 *   connect still lands the normal `done` confirmation + auto-resume.
 */
export function resolveAuthCardPresentation(args: {
  phase: LoginPhase;
  hasProvider: boolean;
  hasFailedPrompt: boolean;
  hasRetry: boolean;
  causeBodyKey: string;
  orgPolicyBlocked?: boolean;
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
    // idle / failed / waiting alike: the generic action never leaves the app
    // for a browser, so there is no browser wait to narrate or cancel.
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

  // idle and failed alike: this card never launches a sign-in (a reconnect
  // can only hit the same policy wall), so a stray login failure elsewhere
  // must not swap in the "sign-in did not finish" body over the honest one.
  if (args.orgPolicyBlocked) {
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
