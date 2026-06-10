import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveEffectiveProvider } from "../src/components/chat-effective-provider.ts";

describe("resolveEffectiveProvider", () => {
  it("prefers the activity override above everything", () => {
    strictEqual(
      resolveEffectiveProvider("openai", "anthropic", "gemini"),
      "openai",
    );
  });

  it("falls to the agent config provider when no activity override", () => {
    strictEqual(resolveEffectiveProvider(null, "openai", "anthropic"), "openai");
  });

  it("falls to the last-used preference when activity + agent are unset (#483)", () => {
    // OpenAI-only user opening a no-provider agent: the dropdown shows and the
    // send forwards openai, NOT the Claude factory default that would fail auth.
    strictEqual(resolveEffectiveProvider(null, null, "openai"), "openai");
  });

  it("uses the anthropic factory default only when every signal is absent", () => {
    strictEqual(resolveEffectiveProvider(null, null, null), "anthropic");
  });
});
