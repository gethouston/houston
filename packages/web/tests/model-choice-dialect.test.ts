import {
  toCanonicalProviderId,
  toDisplayProviderId,
} from "@houston/app/lib/provider-overrides.ts";
import { expect, test } from "vitest";

test("write canonicalizes the display id to the engine id (openai → openai-codex)", () => {
  expect(toCanonicalProviderId("openai")).toBe("openai-codex");
});

test("read maps the stored engine id back to the display id (openai-codex → openai)", () => {
  expect(toDisplayProviderId("openai-codex")).toBe("openai");
});

test("every other provider is identical on both sides (only Codex differs)", () => {
  for (const id of ["anthropic", "opencode", "opencode-go", "groq", "google"]) {
    expect(toCanonicalProviderId(id)).toBe(id);
    expect(toDisplayProviderId(id)).toBe(id);
  }
});

test("the two mappings are inverses — a stored choice round-trips to what the picker shows", () => {
  for (const display of ["openai", "anthropic", "opencode-go", "groq"]) {
    expect(toDisplayProviderId(toCanonicalProviderId(display))).toBe(display);
  }
});
