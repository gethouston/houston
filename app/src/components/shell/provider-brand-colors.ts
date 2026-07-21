/**
 * Curated brand accent colors for the AI Models hub's "candy store" look — the
 * colorful counterpart to the monochrome `ProviderGlyph`. Keyed by `BrandKey`
 * (resolved via `providerBrandKey`, so aliases like "gemini" -> google reuse the
 * parent brand's accent) and consumed by `BrandMark` to tint an otherwise
 * currentColor glyph.
 *
 * This file is the ONE sanctioned place for raw hex literals: these are genuine
 * brand-identity values (a provider's official accent), not UI colors, so they
 * cannot live as theme tokens. The token rule (`text-ink`, `bg-chip`,
 * ...) stays in force EVERYWHERE else — no other file may hardcode a hex.
 *
 * Deliberately ABSENT: xai, vercel, moonshotai, zai, opencode, opencode-go — all
 * black/monochrome brands, which read best rendered in the theme's foreground
 * color rather than a tinted tile, so `providerBrandColor` returns undefined for
 * them and `BrandMark` falls back to its neutral token treatment.
 */

import { type BrandKey, providerBrandKey } from "./provider-logo-map.ts";

/** A `BrandKey` -> official brand accent hex. Absent keys render monochrome. */
const BRAND_COLORS: Partial<Record<BrandKey, string>> = {
  anthropic: "#D97757",
  cohere: "#FF7759",
  meta: "#0668E1",
  qwen: "#615CED",
  openai: "#10A37F",
  google: "#4285F4",
  "google-vertex": "#4285F4",
  "github-copilot": "#8250DF",
  openrouter: "#6366F1",
  "amazon-bedrock": "#FF9900",
  "openai-compatible": "#10B981",
  deepseek: "#4D6BFE",
  minimax: "#F23F5D",
  mistral: "#FA520F",
  groq: "#F55036",
  cerebras: "#F15A22",
  huggingface: "#FFD21E",
  "cloudflare-workers-ai": "#F6821F",
  "cloudflare-ai-gateway": "#F6821F",
  nvidia: "#76B900",
  together: "#0F6FFF",
  fireworks: "#7C3AED",
  xiaomi: "#FF6900",
  "azure-openai-responses": "#0078D4",
};

/**
 * The brand accent hex for a provider id / lab id, or `undefined` when the id is
 * unknown or names an intentionally-monochrome brand. Resolves through
 * `providerBrandKey` so variant and lab aliases share the parent's color.
 */
export function providerBrandColor(providerId: string): string | undefined {
  const key = providerBrandKey(providerId);
  return key ? BRAND_COLORS[key] : undefined;
}
