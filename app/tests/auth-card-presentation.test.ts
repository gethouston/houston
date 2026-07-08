import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  authCauseBodyKey,
  resolveAuthCardPresentation,
} from "../src/components/shell/provider-error-cards/auth-presentation.ts";

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

describe("resolveAuthCardPresentation", () => {
  it("idle: reconnect button, cause-derived body, glyph card", () => {
    deepStrictEqual(
      resolveAuthCardPresentation({
        phase: "idle",
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
    const pres = resolveAuthCardPresentation({
      phase: "done",
      hasFailedPrompt: false,
      hasRetry: false,
      causeBodyKey: CAUSE,
    });
    strictEqual(pres.variant, "done");
    strictEqual(pres.button, null);
  });
});
