import { expect, test } from "vitest";
import {
  PROVIDER_CANONICAL_RENAME,
  PROVIDER_DISPLAY_RENAME,
  toCanonicalProviderId,
  toCanonicalProviderIdOrNull,
  toDisplayProviderId,
  toDisplayProviderIdOrNull,
} from "./provider-dialect";
import { PROVIDER_ALIASES } from "./provider-name-aliases";

test("Codex is the one renamed provider, both ways", () => {
  expect(toDisplayProviderId("openai-codex")).toBe("openai");
  expect(toCanonicalProviderId("openai")).toBe("openai-codex");
});

test("every other id passes through in both directions", () => {
  for (const id of [
    "anthropic",
    "google",
    "github-copilot",
    "amazon-bedrock",
    "opencode-go",
    "some-future-provider",
  ]) {
    expect(toDisplayProviderId(id)).toBe(id);
    expect(toCanonicalProviderId(id)).toBe(id);
  }
});

test("the round trip is stable in both directions", () => {
  for (const [canonical, display] of Object.entries(PROVIDER_DISPLAY_RENAME)) {
    expect(toCanonicalProviderId(toDisplayProviderId(canonical))).toBe(
      canonical,
    );
    expect(toDisplayProviderId(toCanonicalProviderId(display))).toBe(display);
  }
});

test("the two maps are exact inverses", () => {
  expect(Object.entries(PROVIDER_CANONICAL_RENAME)).toEqual(
    Object.entries(PROVIDER_DISPLAY_RENAME).map(([c, d]) => [d, c]),
  );
});

test("an absent value stays absent (a read off disk, never a pick)", () => {
  for (const empty of [null, undefined, ""]) {
    expect(toDisplayProviderIdOrNull(empty)).toBeNull();
    expect(toCanonicalProviderIdOrNull(empty)).toBeNull();
  }
  expect(toDisplayProviderIdOrNull("openai-codex")).toBe("openai");
  expect(toCanonicalProviderIdOrNull("openai")).toBe("openai-codex");
});

test("the spoken-alias ladder inherits the dialect instead of restating it", () => {
  // `openai` resolves because the DIALECT says so, not because someone typed it
  // into the alias table a second time — the two copies are how they drifted.
  for (const [display, canonical] of Object.entries(
    PROVIDER_CANONICAL_RENAME,
  )) {
    expect(PROVIDER_ALIASES[display]).toBe(canonical);
  }
  expect(PROVIDER_ALIASES.chatgpt).toBe("openai-codex");
  expect(PROVIDER_ALIASES.gemini).toBe("google");
});
