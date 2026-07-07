import {
  toCanonicalProviderId,
  toDisplayProviderId,
} from "@houston/app/lib/provider-overrides.ts";
import { expect, test } from "vitest";

/**
 * The hosted Teams model-choice path crosses a provider-id DIALECT boundary in
 * `use-agent-model-choice` (read engine → display, write display → engine).
 * These are the pure helpers that seam uses. The picker offers Houston's DISPLAY
 * id `openai` (its rename of pi's `openai-codex`), but the gateway/runtime
 * resolve pi's `openai-codex`; writing the display id verbatim would land the
 * turn on pi's raw `openai` provider and miss the openai-codex credential ("No
 * credential found for openai"). Canonicalizing on write — mirror of the
 * direct-send `wireTurnPin` and the runtime backstop — prevents that; the read
 * mapping keeps every downstream comparison in the display dialect it assumes.
 */

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
