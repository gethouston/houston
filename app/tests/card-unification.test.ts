import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * HOU-467 — card unification. These guard the user-visible contract of the
 * refactor by asserting on component source (the repo's React-test idiom; the
 * node test runner has no DOM). Three issue requirements + one latent bug:
 *
 *  1. The provider/auth/rate-limit cards render through the shared `RowCard`
 *     with the provider's monochrome `ProviderGlyph` on the left.
 *  2. Their action buttons are icon-free (no key / no provider logo glyph).
 *  3. The provider-switch dialog shows the target provider's logo, not a
 *     generic `Sparkles`.
 *  4. `ProviderGlyph` dispatches per provider id — Gemini gets the Gemini
 *     mark, not the OpenAI logo the old `anthropic ? Claude : OpenAI` ternary
 *     handed every non-Anthropic provider.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("HOU-467 card unification", () => {
  it("UnauthenticatedCard uses RowCard + glyph and drops the key icon", () => {
    const src = read("../src/components/shell/provider-error-cards/auth.tsx");
    ok(src.includes("RowCard"), "renders through RowCard");
    ok(src.includes("ProviderGlyph"), "left media is the provider glyph");
    ok(src.includes("RowCardButton"), "uses the shared row button");
    ok(!src.includes("KeyIcon"), "no key icon anywhere (left or in button)");
  });

  it("ProviderReconnectCard uses the shared glyph, not hand-rolled logos", () => {
    const src = read("../src/components/shell/provider-reconnect-card.tsx");
    ok(src.includes("ProviderGlyph"), "left media is the provider glyph");
    ok(src.includes("RowCard"), "renders through RowCard");
    ok(
      !src.includes("ClaudeLogoSmall") && !src.includes("OpenAILogoSmall"),
      "no duplicated in-button logo SVGs",
    );
  });

  it("RateLimitedCard becomes a RowCard with a clock + icon-free buttons", () => {
    const src = read("../src/components/shell/provider-error-cards/transient.tsx");
    ok(src.includes("RateLimitedCard"), "card still exists");
    ok(src.includes("RowCard"), "rate-limit migrated to RowCard");
    // Per-variant files only mount CTAs; the rate-limit retry is the shared
    // `RetryButton`, which is itself a text-only `RowCardButton` pill (locked
    // against shared.tsx below). transient.tsx no longer references
    // RowCardButton directly.
    ok(src.includes("RetryButton"), "retry CTA is the shared RetryButton pill");
    ok(src.includes("Clock"), "rate-limit shows a clock, not the provider logo");
    ok(!src.includes("ProviderGlyph"), "rate-limit dropped the provider glyph");
    // Every transient variant now renders on the unified RowCard — none remain
    // on the old ErrorCard layout.
    ok(!src.includes("ErrorCard"), "all transient variants migrated off ErrorCard");

    // The shared retry pill IS a RowCardButton, so "buttons are the shared
    // text-only pill" still holds transitively through the wrapper.
    const shared = read("../src/components/shell/provider-error-cards/shared.tsx");
    ok(
      shared.includes("export function RetryButton") &&
        shared.includes("RowCardButton"),
      "RetryButton is a thin RowCardButton wrapper",
    );
  });

  it("ComposioLinkCard (connect Google Drive etc.) uses RowCard", () => {
    const src = read("../src/components/composio-link-card.tsx");
    ok(src.includes("RowCard"), "per-toolkit card renders through RowCard");
    ok(src.includes("AppLogo"), "keeps the app logo as media");
    ok(src.includes("ComposioStatusSlot"), "status slot drops into the action");
    ok(
      !src.includes("border border-black/5 bg-background"),
      "no hand-rolled white shell — RowCard owns the grey surface",
    );
  });

  it("ProviderSwitchDialog shows the provider glyph, not a sparkle", () => {
    const src = read("../src/components/provider-switch-dialog.tsx");
    ok(!src.includes("Sparkles"), "sparkle icon removed");
    ok(src.includes("ProviderGlyph"), "target provider logo shown");
    ok(src.includes("RowCard"), "rendered with the shared card");
    ok(src.includes("providerId"), "threads the target provider id");
  });

  it("ComposioSigninCard keeps its optional trailing link icon", () => {
    const src = read("../src/components/composio-signin-card.tsx");
    ok(src.includes("RowCardButton"), "uses the shared row button");
    ok(
      src.includes("iconPosition=\"trailing\"") && src.includes("ExternalLink"),
      "still passes its trailing link icon via the optional icon prop",
    );
  });

  it("ProviderGlyph dispatches per provider (Gemini != OpenAI)", () => {
    const src = read("../src/components/shell/provider-logos.tsx");
    ok(src.includes("export function ProviderGlyph"), "glyph dispatch exists");
    for (const id of ["anthropic", "openai", "gemini", "deepseek", "minimax"]) {
      ok(src.includes(`case "${id}"`), `has a case for ${id}`);
    }
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
});
