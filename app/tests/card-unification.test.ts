import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * HOU-467 / HOU-529 (gethouston/houston PR #542, ported into houston-web) —
 * card unification. These guard the user-visible contract of the refactor by
 * asserting on component source (the repo's React-test idiom; the node test
 * runner has no DOM). Four issue requirements + one latent bug:
 *
 *  1. The provider/auth/rate-limit cards render through the shared `RowCard`
 *     with the provider's monochrome `ProviderGlyph` on the left.
 *  2. Their action buttons are icon-free (no key / no provider logo glyph).
 *  3. The provider-switch dialog shows the target provider's logo, not a
 *     generic `Sparkles`.
 *  4. `ProviderGlyph` dispatches per provider id — Gemini gets the Gemini
 *     mark, not the OpenAI logo the old `anthropic ? Claude : OpenAI` ternary
 *     handed every non-Anthropic provider — and falls back to a monogram tile
 *     for anything unknown, so a provider can never borrow the wrong brand's
 *     logo.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("HOU-467 / HOU-529 card unification", () => {
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
    // The rate-limit retry is the shared `RetryButton` — a text-only
    // `RowCardButton` pill (locked against shared.tsx below) — and the
    // switch-model CTA is a plain RowCardButton, so the buttons are always the
    // shared text-only pill.
    ok(src.includes("RetryButton"), "retry CTA is the shared RetryButton pill");
    ok(
      src.includes("RowCardButton"),
      "switch-model CTA is a plain text-only RowCardButton pill",
    );
    ok(
      src.includes("Clock"),
      "rate-limit shows a clock, not the provider logo",
    );
    ok(!src.includes("ProviderGlyph"), "rate-limit dropped the provider glyph");
    // Every transient variant now renders on the unified RowCard — none remain
    // on the old ErrorCard layout.
    ok(
      !src.includes("ErrorCard"),
      "all transient variants migrated off ErrorCard",
    );

    // The shared retry pill IS a RowCardButton, so "buttons are the shared
    // text-only pill" still holds transitively through the wrapper.
    const shared = read(
      "../src/components/shell/provider-error-cards/shared.tsx",
    );
    ok(
      shared.includes("export function RetryButton") &&
        shared.includes("RowCardButton"),
      "RetryButton is a thin RowCardButton wrapper",
    );
  });

  it("ProviderSwitchDialog shows the provider glyph, not a sparkle", () => {
    const src = read("../src/components/provider-switch-dialog.tsx");
    ok(!src.includes("Sparkles"), "sparkle icon removed");
    ok(src.includes("ProviderGlyph"), "target provider logo shown");
    ok(src.includes("RowCard"), "rendered with the shared card");
    ok(src.includes("providerId"), "threads the target provider id");
  });

  it("ProviderGlyph dispatches per provider (Gemini != OpenAI, unknown falls back to a monogram)", () => {
    const src = read("../src/components/shell/provider-logos.tsx");
    ok(src.includes("export function ProviderGlyph"), "glyph dispatch exists");
    // Dispatch is a `BrandKey -> mark` registry keyed by the resolver in
    // provider-logo-map.ts, not the old `anthropic ? Claude : OpenAI` ternary.
    // Every brand mark gets its own registry entry — Gemini binds to `google`
    // (its provider id), never OpenAI. (provider-logo-map.test.ts locks the
    // id -> key folding, incl. the historical "gemini" -> "google" alias.)
    ok(src.includes("BRAND_LOGOS"), "dispatch is the brand-key registry");
    for (const key of [
      "anthropic",
      "openai",
      "google",
      "github-copilot",
      "openrouter",
      "opencode",
      "deepseek",
      "minimax",
    ]) {
      ok(
        new RegExp(`"?${key}"?:`).test(src),
        `registry binds a mark for ${key}`,
      );
    }
    // The defensive fallback: an unknown provider renders a monogram tile, never
    // a borrowed brand logo. `?? <Monogram` is the tell.
    ok(
      src.includes("?? <Monogram"),
      "fallback is the monogram tile, never a borrowed logo",
    );
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
