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
export type AuthCardAction = "reconnect" | "cancel";

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
 */
export function resolveAuthCardPresentation(args: {
  phase: LoginPhase;
  hasProvider: boolean;
  hasFailedPrompt: boolean;
  hasRetry: boolean;
  causeBodyKey: string;
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
