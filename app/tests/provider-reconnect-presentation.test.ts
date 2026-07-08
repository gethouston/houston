import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveReconnectCardPresentation } from "../src/components/shell/provider-reconnect-presentation.ts";

// The store-driven reconnect card has two states keyed on loginLaunched. The
// launched button used to borrow common:actions.tryAgain ("Try again"), which
// read as a message-retry; it now names its real action, "Sign in again".

describe("resolveReconnectCardPresentation", () => {
  it("resting state: sign-in prompt, default button", () => {
    deepStrictEqual(
      resolveReconnectCardPresentation({
        loginLaunched: false,
        loginError: false,
      }),
      {
        descriptionKey: "shell:providerReconnect.body",
        buttonLabelKey: "shell:authReconnect.signInWith",
        buttonVariant: "default",
      },
    );
  });

  it("launched state: waiting body, scoped Sign-in-again button (not tryAgain)", () => {
    deepStrictEqual(
      resolveReconnectCardPresentation({
        loginLaunched: true,
        loginError: false,
      }),
      {
        descriptionKey: "shell:providerReconnect.waiting",
        buttonLabelKey: "shell:providerReconnect.signInAgain",
        buttonVariant: "outline",
      },
    );
  });

  it("launch error: error body wins, button still names Sign in again", () => {
    deepStrictEqual(
      resolveReconnectCardPresentation({
        loginLaunched: true,
        loginError: true,
      }),
      {
        descriptionKey: "shell:providerReconnect.launchError",
        buttonLabelKey: "shell:providerReconnect.signInAgain",
        buttonVariant: "outline",
      },
    );
  });

  it("error before launch: error body, resting sign-in button", () => {
    deepStrictEqual(
      resolveReconnectCardPresentation({
        loginLaunched: false,
        loginError: true,
      }),
      {
        descriptionKey: "shell:providerReconnect.launchError",
        buttonLabelKey: "shell:authReconnect.signInWith",
        buttonVariant: "default",
      },
    );
  });
});
