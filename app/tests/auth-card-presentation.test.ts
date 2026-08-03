import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  authCauseBodyKey,
  resolveAuthCardPresentation,
} from "../src/components/shell/provider-error-cards/auth-presentation.ts";
import { reconnectSurface } from "../src/components/shell/provider-error-cards/reconnect-surface.ts";

// The card once labeled two opposite actions "Try again". These assert the
// state -> title/body/button mapping so each phase names its real action:
// idle/failed -> Reconnect, waiting -> Cancel, done -> a disabled "Signed in"
// badge (the resume auto-fired: the refused send's prompt, or the hidden
// auto-continue nudge for a mid-turn failure — HOU-718).

const CAUSE = "providerError.unauthenticated.bodyTokenExpired";

describe("authCauseBodyKey", () => {
  it("maps every known cause to its own body key", () => {
    strictEqual(
      authCauseBodyKey("token_expired"),
      "providerError.unauthenticated.bodyTokenExpired",
    );
    strictEqual(
      authCauseBodyKey("no_credentials"),
      "providerError.unauthenticated.bodyNoCredentials",
    );
    strictEqual(
      authCauseBodyKey("invalid_api_key"),
      "providerError.unauthenticated.bodyInvalidApiKey",
    );
    strictEqual(
      authCauseBodyKey("token_revoked"),
      "providerError.unauthenticated.bodyTokenRevoked",
    );
  });

  it("falls back to the unknown body for any other cause", () => {
    strictEqual(
      // deliberately outside the union
      authCauseBodyKey("mystery" as never),
      "providerError.unauthenticated.bodyUnknown",
    );
  });
});

describe("reconnectSurface", () => {
  // Reconnect once sent EVERY provider through launchLogin, which the engine
  // 400s for non-OAuth providers ("nvidia does not use OAuth sign-in") — the
  // card flipped to failed with no way out (HOU-1077). API-key providers must
  // reconnect through the key paste dialog instead.
  it("api-key providers open the key dialog, never the OAuth login", () => {
    strictEqual(reconnectSurface("nvidia", "apiKey"), "api_key_dialog");
    strictEqual(reconnectSurface("google", "apiKey"), "api_key_dialog");
    strictEqual(
      reconnectSurface("qwen-token-plan", "apiKey"),
      "api_key_dialog",
    );
  });

  it("OAuth providers keep the browser login", () => {
    strictEqual(reconnectSurface("anthropic", "oauth"), "oauth_login");
    strictEqual(reconnectSurface("openai-codex", "oauth"), "oauth_login");
  });

  it("the local provider keeps its guided endpoint dialog, whatever the catalog says", () => {
    strictEqual(
      reconnectSurface("openai-compatible", "openaiCompatible"),
      "local_model_dialog",
    );
    strictEqual(
      reconnectSurface("openai-compatible", undefined),
      "local_model_dialog",
    );
  });

  it("an id the catalog cannot resolve falls back to the OAuth login", () => {
    // Only the engine knows the method then; its launch keeps the non-OAuth guard.
    strictEqual(reconnectSurface("mystery", undefined), "oauth_login");
  });
});

describe("resolveAuthCardPresentation", () => {
  it("idle: reconnect button, cause-derived body, glyph card", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "idle",
        hasProvider: true,
        hasFailedPrompt: false,
        hasRetry: false,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.title",
        bodyKey: CAUSE,
        button: {
          kind: "action",
          labelKey: "providerError.unauthenticated.reconnect",
          action: "reconnect",
        },
      },
    );
  });

  it("waiting: the action is Cancel, not a retry", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "waiting",
        hasProvider: true,
        hasFailedPrompt: true,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.title",
        bodyKey: "providerError.unauthenticated.waiting",
        button: {
          kind: "action",
          labelKey: "common:actions.cancel",
          action: "cancel",
        },
      },
    );
  });

  it("failed: reconnect button with the failed body", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "failed",
        hasProvider: true,
        hasFailedPrompt: false,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.title",
        bodyKey: "providerError.unauthenticated.failedBody",
        button: {
          kind: "action",
          labelKey: "providerError.unauthenticated.reconnect",
          action: "reconnect",
        },
      },
    );
  });

  it("done + refused send: disabled Signed-in badge, resending body", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: true,
        hasFailedPrompt: true,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "done",
        titleKey: "providerError.unauthenticated.reconnectedTitle",
        bodyKey: "providerError.unauthenticated.reconnectedResending",
        button: {
          kind: "badge",
          labelKey: "providerError.unauthenticated.signedIn",
        },
      },
    );
  });

  it("done + mid-turn failure: Signed-in badge, resuming body (HOU-718)", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: true,
        hasFailedPrompt: false,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "done",
        titleKey: "providerError.unauthenticated.reconnectedTitle",
        bodyKey: "providerError.unauthenticated.reconnectedResuming",
        button: {
          kind: "badge",
          labelKey: "providerError.unauthenticated.signedIn",
        },
      },
    );
  });

  it("done without a retry handler: no button at all", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: true,
        hasFailedPrompt: false,
        hasRetry: false,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "done",
        titleKey: "providerError.unauthenticated.reconnectedTitle",
        bodyKey: "providerError.unauthenticated.reconnectedBody",
        button: null,
      },
    );
  });
});

// An unauthenticated error can arrive with NO provider (nothing connected at
// all). Every string above interpolates `{{provider}}`, so the whole card has
// to switch to provider-free copy: naming an empty provider read as broken, and
// the guess it replaced ("anthropic") named a provider the user never had.
describe("resolveAuthCardPresentation without a provider", () => {
  it("idle: generic title + body, and the button says Connect a provider", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "idle",
        hasProvider: false,
        hasFailedPrompt: false,
        hasRetry: false,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.titleGeneric",
        bodyKey: "providerError.unauthenticated.bodyGeneric",
        button: {
          kind: "action",
          labelKey: "providerError.unauthenticated.connectProvider",
          action: "reconnect",
        },
      },
    );
  });

  it("failed: the same generic prompt, never the provider-named failure body", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "failed",
        hasProvider: false,
        hasFailedPrompt: false,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.titleGeneric",
        bodyKey: "providerError.unauthenticated.bodyGeneric",
        button: {
          kind: "action",
          labelKey: "providerError.unauthenticated.connectProvider",
          action: "reconnect",
        },
      },
    );
  });

  it("the cause body is ignored: every cause key names a provider", () => {
    const pres = resolveAuthCardPresentation({
      phase: "idle",
      hasProvider: false,
      hasFailedPrompt: false,
      hasRetry: false,
      causeBodyKey: authCauseBodyKey("token_expired"),
    });
    strictEqual(pres.bodyKey, "providerError.unauthenticated.bodyGeneric");
  });

  it("waiting cannot be provider-named either (the generic action opens no browser)", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "waiting",
        hasProvider: false,
        hasFailedPrompt: false,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.titleGeneric",
        bodyKey: "providerError.unauthenticated.bodyGeneric",
        button: {
          kind: "action",
          labelKey: "providerError.unauthenticated.connectProvider",
          action: "reconnect",
        },
      },
    );
  });

  it("done: generic confirmation title, unchanged resume bodies + Signed-in badge", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: false,
        hasFailedPrompt: true,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "done",
        titleKey: "providerError.unauthenticated.reconnectedTitleGeneric",
        bodyKey: "providerError.unauthenticated.reconnectedResending",
        button: {
          kind: "badge",
          labelKey: "providerError.unauthenticated.signedIn",
        },
      },
    );
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: false,
        hasFailedPrompt: false,
        hasRetry: true,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "done",
        titleKey: "providerError.unauthenticated.reconnectedTitleGeneric",
        bodyKey: "providerError.unauthenticated.reconnectedResuming",
        button: {
          kind: "badge",
          labelKey: "providerError.unauthenticated.signedIn",
        },
      },
    );
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: false,
        hasFailedPrompt: false,
        hasRetry: false,
        causeBodyKey: CAUSE,
      }),
      {
        variant: "done",
        titleKey: "providerError.unauthenticated.reconnectedTitleGeneric",
        bodyKey: "providerError.unauthenticated.reconnectedBody",
        button: null,
      },
    );
  });
});
