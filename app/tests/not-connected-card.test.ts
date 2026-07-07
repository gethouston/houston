import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FeedItem, ProviderError } from "@houston-ai/chat";
import {
  continuesTaskAfterReconnect,
  isInlineAuthCardForChat,
  providerErrorRetryText,
  resendsOriginalPrompt,
  resolveProviderErrorForChat,
} from "../src/components/shell/provider-error-cards/not-connected.ts";

// HOU-676: the not-connected refusal settles as a typed unauthenticated card
// synthesized client-side. These helpers are the surface's half of that
// contract: label a provider-less card with the chat's own provider, resend
// the refused prompt (not the generic retry), and keep the auto-dismissing
// store-driven card suppressed while the inline card is present.

const notConnectedCard: ProviderError = {
  kind: "unauthenticated",
  provider: "",
  cause: "no_credentials",
  message: "No provider connected. Connect an AI provider first.",
  failed_prompt: "hey",
};

describe("resolveProviderErrorForChat", () => {
  it("labels a provider-less card with this chat's provider", () => {
    const resolved = resolveProviderErrorForChat(notConnectedCard, "openai");
    strictEqual(resolved.provider, "openai");
  });

  it("never rewrites a card that already names its provider", () => {
    const wireCard: ProviderError = {
      kind: "unauthenticated",
      provider: "anthropic",
      cause: "token_expired",
      message: "session expired",
    };
    deepStrictEqual(resolveProviderErrorForChat(wireCard, "openai"), wireCard);
  });
});

describe("resendsOriginalPrompt", () => {
  it("marks the refused-send card: auto-resend, no duplicate bubble", () => {
    strictEqual(resendsOriginalPrompt(notConnectedCard), true);
  });

  it("never marks live-turn failures: explicit CTA, bubble kept", () => {
    strictEqual(
      resendsOriginalPrompt({
        kind: "unauthenticated",
        provider: "anthropic",
        cause: "token_expired",
        message: "session expired",
      }),
      false,
    );
    strictEqual(
      resendsOriginalPrompt({
        kind: "rate_limited",
        provider: "anthropic",
        model: null,
        retry_after_seconds: null,
        message: "slow down",
      }),
      false,
    );
  });
});

describe("continuesTaskAfterReconnect", () => {
  it("marks the mid-turn auth failure: reconnect resumes the task (HOU-718)", () => {
    strictEqual(
      continuesTaskAfterReconnect({
        kind: "unauthenticated",
        provider: "anthropic",
        cause: "token_expired",
        message: "session expired",
      }),
      true,
    );
  });

  it("never marks the refused send (it resends its prompt) or other kinds", () => {
    strictEqual(continuesTaskAfterReconnect(notConnectedCard), false);
    strictEqual(
      continuesTaskAfterReconnect({
        kind: "rate_limited",
        provider: "anthropic",
        model: null,
        retry_after_seconds: null,
        message: "slow down",
      }),
      false,
    );
  });
});

describe("providerErrorRetryText", () => {
  it("resends the refused prompt when the send never reached the engine", () => {
    strictEqual(providerErrorRetryText(notConnectedCard, "Try again"), "hey");
  });

  it("keeps the generic retry prompt for live-turn failures", () => {
    const liveCard: ProviderError = {
      kind: "unauthenticated",
      provider: "anthropic",
      cause: "token_expired",
      message: "session expired",
    };
    strictEqual(providerErrorRetryText(liveCard, "Try again"), "Try again");
    const rateLimited: ProviderError = {
      kind: "rate_limited",
      provider: "anthropic",
      model: null,
      retry_after_seconds: null,
      message: "slow down",
    };
    strictEqual(providerErrorRetryText(rateLimited, "Try again"), "Try again");
  });
});

describe("isInlineAuthCardForChat", () => {
  const item = (data: ProviderError): FeedItem => ({
    feed_type: "provider_error",
    data,
  });

  it("matches this chat's provider and the provider-less refusal", () => {
    strictEqual(
      isInlineAuthCardForChat(
        item({ ...notConnectedCard, provider: "openai" }),
        "openai",
      ),
      true,
    );
    // Empty provider = NOTHING was connected, which includes this chat's.
    strictEqual(
      isInlineAuthCardForChat(item(notConnectedCard), "openai"),
      true,
    );
  });

  it("never matches a foreign provider's card or other kinds", () => {
    strictEqual(
      isInlineAuthCardForChat(
        item({ ...notConnectedCard, provider: "anthropic" }),
        "openai",
      ),
      false,
    );
    strictEqual(
      isInlineAuthCardForChat(
        item({
          kind: "rate_limited",
          provider: "openai",
          model: null,
          retry_after_seconds: null,
          message: "slow down",
        }),
        "openai",
      ),
      false,
    );
    strictEqual(
      isInlineAuthCardForChat(
        { feed_type: "system_message", data: "hello" } as FeedItem,
        "openai",
      ),
      false,
    );
  });
});
