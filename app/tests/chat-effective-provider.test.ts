import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveEffectiveProvider } from "../src/components/chat-effective-provider.ts";

describe("resolveEffectiveProvider", () => {
  it("honors an explicit activity provider as-is, even when logged out", () => {
    // Chat must NOT auto-switch: a Claude-configured chat stays on Claude even
    // when only OpenAI is connected (the send then surfaces the reconnect card).
    strictEqual(resolveEffectiveProvider("anthropic", null, "openai", ["openai"]), "anthropic");
  });

  it("honors an explicit agent provider as-is, even when logged out", () => {
    strictEqual(resolveEffectiveProvider(null, "anthropic", null, ["openai"]), "anthropic");
  });

  it("prefers the activity provider over the agent provider", () => {
    strictEqual(
      resolveEffectiveProvider("openai", "anthropic", null, ["anthropic", "openai"]),
      "openai",
    );
  });

  it("auth-gates the no-config fallback to the preferred provider when logged in", () => {
    strictEqual(resolveEffectiveProvider(null, null, "openai", ["anthropic", "openai"]), "openai");
  });

  it("auth-switches the no-config fallback off a logged-out preference (#483)", () => {
    // No explicit provider: this is initial selection, so switching is fine.
    strictEqual(resolveEffectiveProvider(null, null, "anthropic", ["openai"]), "openai");
  });

  it("picks the sole authed provider for the fallback when there is no preference", () => {
    strictEqual(resolveEffectiveProvider(null, null, null, ["openai"]), "openai");
  });

  it("keeps the preferred fallback when statuses haven't loaded (empty)", () => {
    strictEqual(resolveEffectiveProvider(null, null, "openai", []), "openai");
    strictEqual(resolveEffectiveProvider(null, null, null, []), "anthropic");
  });
});
