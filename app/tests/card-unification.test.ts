import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * HOU-529 (port of HOU-467 / gethouston/houston PR #542) — card unification.
 * These guard the user-visible contract of the refactor by asserting on
 * component source (the repo's React-test idiom; the node test runner has no
 * DOM).
 *
 * Scope note for this codebase: only the chat reconnect / error cards exist
 * here. The Composio sign-in/link cards and the provider-switch dialog from
 * the source PR are NOT present in this fork, so their assertions are omitted.
 * Three requirements + one latent bug are covered:
 *
 *  1. The provider/auth/rate-limit cards render through the shared `RowCard`
 *     with the provider's monochrome `ProviderGlyph` on the left.
 *  2. Their action buttons are icon-free (no key / no provider logo glyph).
 *  3. `ProviderGlyph` dispatches per provider id and falls back to the
 *     provider's initial for anything unknown, so a provider can never borrow
 *     the wrong brand's logo the way the old `anthropic ? Claude : OpenAI`
 *     ternary handed every non-Anthropic provider the OpenAI mark.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("HOU-529 card unification", () => {
  it("UnauthenticatedCard uses RowCard + glyph and drops the key icon", () => {
    const src = read("../src/components/shell/provider-error-cards/auth.tsx");
    ok(src.includes("RowCard"), "renders through RowCard");
    ok(src.includes("ProviderGlyph"), "left media is the provider glyph");
    ok(src.includes("RowCardButton"), "uses the shared row button");
    ok(!src.includes("KeyIcon"), "no key icon anywhere (left or in button)");
    ok(!src.includes("ErrorCard"), "off the old ErrorCard shell");
  });

  it("ProviderReconnectCard uses the shared glyph, not hand-rolled logos", () => {
    const src = read("../src/components/shell/provider-reconnect-card.tsx");
    ok(src.includes("ProviderGlyph"), "left media is the provider glyph");
    ok(src.includes("RowCard"), "renders through RowCard");
    ok(
      !src.includes("ClaudeLogoSmall") && !src.includes("OpenAILogoSmall"),
      "no duplicated in-button logo SVGs",
    );
    ok(
      !src.includes('=== "anthropic" ? <ClaudeLogo'),
      "no anthropic ? Claude : OpenAI ternary",
    );
  });

  it("RateLimitedCard becomes a RowCard with a clock + icon-free buttons", () => {
    const src = read(
      "../src/components/shell/provider-error-cards/transient.tsx",
    );
    ok(src.includes("RateLimitedCard"), "card still exists");
    ok(src.includes("RowCard"), "rate-limit migrated to RowCard");
    ok(src.includes("RowCardButton"), "buttons are the shared text-only pill");
    ok(
      src.includes("Clock"),
      "rate-limit shows a clock, not the provider logo",
    );
    ok(!src.includes("ProviderGlyph"), "rate-limit dropped the provider glyph");
    // Sibling cards in this file stay on the old ErrorCard layout untouched.
    ok(src.includes("ErrorCard"), "siblings still use ErrorCard");
  });

  it("ProviderGlyph dispatches per provider (unknown != OpenAI)", () => {
    const src = read("../src/components/shell/provider-logos.tsx");
    ok(src.includes("export function ProviderGlyph"), "glyph dispatch exists");
    // Every provider this fork has a brand mark for gets its own case
    // (note: Gemini's provider id is "google").
    for (const id of [
      "anthropic",
      "openai",
      "google",
      "github-copilot",
      "openrouter",
      "opencode",
      "deepseek",
      "minimax",
    ]) {
      ok(src.includes(`case "${id}"`), `has a case for ${id}`);
    }
    // The defensive fallback: an unknown provider renders its initial, never
    // a borrowed brand logo. `slice(0, 1)` is the tell.
    ok(src.includes("default:"), "has a fallback branch");
    ok(src.includes("slice(0, 1)"), "fallback uses the provider's initial");
  });

  it("RowCardButton makes the icon optional + keeps the rage-click guard", () => {
    const src = read("../src/components/cards/row-card-button.tsx");
    ok(src.includes("icon?:"), "icon prop is optional");
    ok(
      src.includes("iconPosition"),
      "supports leading/trailing icon placement",
    );
    ok(
      src.includes("AsyncButton"),
      "built on the shared AsyncButton (HOU-465 rage-click guard)",
    );
  });

  it("RowCard renders the shared grey slab with a media/title/action layout", () => {
    const src = read("../src/components/cards/row-card.tsx");
    ok(
      src.includes("bg-secondary"),
      "grey slab, not a white hand-rolled shell",
    );
    ok(
      src.includes("media") && src.includes("title") && src.includes("action"),
      "left media + title + right action slots",
    );
    ok(src.includes("inline"), "supports the inline (prose) variant");
  });
});
