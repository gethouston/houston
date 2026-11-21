import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  authCauseBodyKey,
  resolveAuthCardPresentation,
} from "../src/components/shell/provider-error-cards/auth-presentation.ts";
import { unhealableCause } from "../src/components/shell/provider-error-cards/auth-unhealable.ts";
import { reconnectSurface } from "../src/components/shell/provider-error-cards/reconnect-surface.ts";

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
    strictEqual(
      authCauseBodyKey("org_policy_blocked"),
      "providerError.unauthenticated.bodyOrgPolicyBlocked",
    );
    strictEqual(
      authCauseBodyKey("billing_locked"),
      "providerError.unauthenticated.bodyBillingLocked",
    );
  });

  it("falls back to the unknown body for any other cause", () => {
    strictEqual(
      authCauseBodyKey("mystery" as never),
      "providerError.unauthenticated.bodyUnknown",
    );
  });
});

describe("reconnectSurface", () => {
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

describe("resolveAuthCardPresentation for an org-policy block", () => {
  const ORG = "providerError.unauthenticated.bodyOrgPolicyBlocked";

  it("idle: honest org-policy copy, and the action opens the AI Hub, never a sign-in", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "idle",
        hasProvider: true,
        hasFailedPrompt: false,
        hasRetry: false,
        causeBodyKey: authCauseBodyKey("org_policy_blocked"),
        unhealable: "org_policy_blocked",
      }),
      {
        variant: "active",
        titleKey: "providerError.unauthenticated.titleOrgPolicy",
        bodyKey: ORG,
        button: {
          kind: "action",
          labelKey: "providerError.unauthenticated.useApiKey",
          action: "open_ai_hub",
        },
      },
    );
  });

  it("failed: still the org-policy copy — a stray login failure must not swap in 'sign-in did not finish'", () => {
    const pres = resolveAuthCardPresentation({
      phase: "failed",
      hasProvider: true,
      hasFailedPrompt: false,
      hasRetry: true,
      causeBodyKey: authCauseBodyKey("org_policy_blocked"),
      unhealable: "org_policy_blocked",
    });
    strictEqual(pres.bodyKey, ORG);
    strictEqual(
      pres.button?.kind === "action" ? pres.button.action : null,
      "open_ai_hub",
    );
  });

  it("idle/failed with a blocked account: names the block and points at another AI, never a sign-in (H-005)", () => {
    for (const phase of ["idle", "failed"] as const) {
      deepStrictEqual(
        resolveAuthCardPresentation({
          phase,
          hasProvider: true,
          hasFailedPrompt: true,
          hasRetry: true,
          causeBodyKey: authCauseBodyKey("billing_locked"),
          unhealable: "billing_locked",
        }),
        {
          variant: "active",
          titleKey: "providerError.unauthenticated.titleBillingLocked",
          bodyKey: "providerError.unauthenticated.bodyBillingLocked",
          button: {
            kind: "action",
            labelKey: "providerError.unauthenticated.chooseAnotherAi",
            action: "open_ai_hub",
          },
        },
      );
    }
  });

  it("unhealableCause names only the causes a sign-in cannot heal", () => {
    strictEqual(unhealableCause("org_policy_blocked"), "org_policy_blocked");
    strictEqual(unhealableCause("billing_locked"), "billing_locked");
    strictEqual(unhealableCause("token_expired"), undefined);
    strictEqual(unhealableCause("no_credentials"), undefined);
  });

  it("done: a successful connect (an API key counts) confirms and resumes as usual", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "done",
        hasProvider: true,
        hasFailedPrompt: false,
        hasRetry: true,
        causeBodyKey: authCauseBodyKey("org_policy_blocked"),
        unhealable: "org_policy_blocked",
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
});

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
