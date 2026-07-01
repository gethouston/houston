import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveEffectiveProvider } from "../src/components/chat-effective-provider.ts";

describe("resolveEffectiveProvider", () => {
  it("uses an explicit (activity/agent) provider for a fresh chat when it is connected", () => {
    strictEqual(
      resolveEffectiveProvider(
        "anthropic",
        null,
        "openai",
        ["anthropic", "openai"],
        false,
      ),
      "anthropic",
    );
    strictEqual(
      resolveEffectiveProvider(
        null,
        "anthropic",
        null,
        ["anthropic", "openai"],
        false,
      ),
      "anthropic",
    );
  });

  it("does NOT default a fresh chat onto a configured-but-logged-out provider", () => {
    // The reported bug: an agent configured for OpenAI opens a NEW chat while
    // OpenAI is logged out — it must land on a connected provider (OpenRouter),
    // not show a disconnected GPT-5.5 as the selected model. (Switching is safe
    // here: no turn has run yet. An in-progress chat still freezes — see below.)
    strictEqual(
      resolveEffectiveProvider("openai", null, null, ["openrouter"], false),
      "openrouter",
    );
    strictEqual(
      resolveEffectiveProvider(null, "openai", "openai", ["openrouter"], false),
      "openrouter",
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

  // Preserved from public (gethouston/houston): on a frozen (in-progress) chat,
  // an explicit activity/agent provider stays put even when its provider is
  // logged out. The send then surfaces the reconnect card instead of silently
  // auto-switching to a connected provider. Under the new contract this is the
  // hasMessages=true branch.
  it("honors an explicit activity provider as-is on a frozen chat, even when logged out", () => {
    strictEqual(
      resolveEffectiveProvider("anthropic", null, "openai", ["openai"], true),
      "anthropic",
    );
  });

  it("honors an explicit agent provider as-is on a frozen chat, even when logged out", () => {
    strictEqual(
      resolveEffectiveProvider(null, "anthropic", null, ["openai"], true),
      "anthropic",
    );
  });
});
