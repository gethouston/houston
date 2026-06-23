import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveEffectiveProvider } from "../src/components/chat-effective-provider.ts";

describe("resolveEffectiveProvider", () => {
  it("honors an explicit activity provider as-is, even when logged out", () => {
    // Chat must NOT auto-switch: a Claude-configured chat stays on Claude even
    // when only OpenAI is connected (the send then surfaces the reconnect card).
    strictEqual(
      resolveEffectiveProvider("anthropic", null, "openai", ["openai"], false),
      "anthropic",
    );
  });

  it("honors an explicit agent provider as-is, even when logged out", () => {
    strictEqual(
      resolveEffectiveProvider(null, "anthropic", null, ["openai"], false),
      "anthropic",
    );
  });

  it("prefers the activity provider over the agent provider", () => {
    strictEqual(
      resolveEffectiveProvider(
        "openai",
        "anthropic",
        null,
        ["anthropic", "openai"],
        false,
      ),
      "openai",
    );
  });

  it("auth-gates the no-config fallback to the preferred provider when logged in", () => {
    strictEqual(
      resolveEffectiveProvider(
        null,
        null,
        "openai",
        ["anthropic", "openai"],
        false,
      ),
      "openai",
    );
  });

  it("auth-switches the no-config fallback off a logged-out preference (#483)", () => {
    // No explicit provider AND no messages: this is initial selection, so
    // switching to the connected provider is fine.
    strictEqual(
      resolveEffectiveProvider(null, null, "anthropic", ["openai"], false),
      "openai",
    );
  });

  it("picks the sole authed provider for the fallback when there is no preference", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, null, ["openai"], false),
      "openai",
    );
  });

  it("keeps the preferred fallback when statuses haven't loaded (empty)", () => {
    strictEqual(
      resolveEffectiveProvider(null, null, "openai", [], false),
      "openai",
    );
    strictEqual(
      resolveEffectiveProvider(null, null, null, [], false),
      "anthropic",
    );
  });
});

describe("resolveEffectiveProvider — frozen once a conversation has messages", () => {
  it("does NOT switch an in-progress chat to another connected provider when its own logs out", () => {
    // The exact bug: a GPT-5.5 chat (no explicit pin, last-used = openai) whose
    // OpenAI logged out must STAY on openai (→ reconnect card), never silently
    // jump to the still-connected OpenRouter and answer under it.
    strictEqual(
      resolveEffectiveProvider(null, null, "openai", ["openrouter"], true),
      "openai",
    );
  });

  it("freezes to the preferred provider even when others are connected", () => {
    strictEqual(
      resolveEffectiveProvider(
        null,
        null,
        "openai",
        ["openai", "openrouter"],
        true,
      ),
      "openai",
    );
  });

  it("a fresh (message-less) composer still auth-switches off a logged-out preference", () => {
    // Same inputs as the freeze case but with no messages → initial selection,
    // so picking the connected provider is correct here.
    strictEqual(
      resolveEffectiveProvider(null, null, "openai", ["openrouter"], false),
      "openrouter",
    );
  });

  it("still honors an explicit provider with messages (explicit wins over the freeze)", () => {
    strictEqual(
      resolveEffectiveProvider(
        "openai",
        null,
        "anthropic",
        ["anthropic"],
        true,
      ),
      "openai",
    );
  });
});
