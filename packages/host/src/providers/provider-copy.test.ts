import { expect, test } from "vitest";
import {
  cloudProviderUnavailable,
  routineProviderUnavailable,
  sentenceProviderName,
} from "./provider-copy";

test("a provider is named the way the app names it, without the plan parenthetical", () => {
  expect(sentenceProviderName("anthropic")).toBe("Claude");
  expect(sentenceProviderName("openai-codex")).toBe("ChatGPT / Codex");
  expect(sentenceProviderName("google")).toBe("Google Gemini");
});

test("a provider the catalog does not carry keeps its own id", () => {
  // Better a bare id than an empty sentence; the catalog stays the one source
  // of names, so nothing is invented here.
  expect(sentenceProviderName("gemini-cli")).toBe("gemini-cli");
});

test("the routine sentences never print pi's canonical id", () => {
  expect(routineProviderUnavailable("openai-codex")).toBe(
    "This routine runs on ChatGPT / Codex, which is not available here. Open the routine and pick another provider.",
  );
  expect(cloudProviderUnavailable("anthropic")).toBe(
    "Claude is not available for cloud agents. Open the routine and pick another provider.",
  );
});

test("no sentence carries an em dash", () => {
  for (const s of [
    routineProviderUnavailable("anthropic"),
    cloudProviderUnavailable("anthropic"),
  ])
    expect(s).not.toContain("—");
});
