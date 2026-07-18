import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FeedItem, ProviderError } from "@houston-ai/chat";
import {
  continuesTaskAfterReconnect,
  isInlineAuthCard,
  providerErrorRetryText,
  reconnectContinueText,
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

describe("reconnectContinueText", () => {
  it("re-delivers the undelivered prompt when the model never received it", () => {
    // pi's prompt-time credential guard raised before recording the message
    // in its session store — a bare "continue" would meet a model that never
    // saw the message ("I don't see a previous task").
    strictEqual(
      reconnectContinueText(
        {
          kind: "unauthenticated",
          provider: "openai",
          cause: "no_credentials",
          message: "No API key found for openai-codex.",
          undelivered_prompt: "is this working",
        },
        "Please continue.",
      ),
      "is this working",
    );
  });

  it("keeps the generic nudge for a streamed mid-turn failure (context intact)", () => {
    strictEqual(
      reconnectContinueText(
        {
          kind: "unauthenticated",
          provider: "anthropic",
          cause: "token_expired",
          message: "session expired",
        },
        "Please continue.",
      ),
      "Please continue.",
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

describe("isInlineAuthCard", () => {
  const item = (data: ProviderError): FeedItem => ({
    feed_type: "provider_error",
    data,
  });

  it("matches any persisted unauthenticated card, regardless of provider", () => {
    strictEqual(isInlineAuthCard(item(notConnectedCard)), true);
    strictEqual(
      isInlineAuthCard(item({ ...notConnectedCard, provider: "openai" })),
      true,
    );
    // The inline card carries the provider the turn ACTUALLY failed on — a
    // stale chat-provider resolution must never let a second (wrong-provider)
    // store card render next to it, so the match is provider-agnostic.
    strictEqual(
      isInlineAuthCard(
        item({ ...notConnectedCard, provider: "openai-compatible" }),
      ),
      true,
    );
  });

  it("never matches other kinds or non-provider-error items", () => {
    strictEqual(
      isInlineAuthCard(
        item({
          kind: "rate_limited",
          provider: "openai",
          model: null,
          retry_after_seconds: null,
          message: "slow down",
        }),
      ),
      false,
    );
    strictEqual(
      isInlineAuthCard({
        feed_type: "system_message",
        data: "hello",
      } as FeedItem),
      false,
    );
  });
});
