/**
 * The single source of truth mapping a provider id (or an AI-hub lab id) to the
 * brand mark it should draw. Pure data + resolution, kept free of JSX so it is
 * unit-testable and so the logo dispatchers (`ProviderGlyph`, the provider
 * cards) share ONE table instead of three drifting `switch`es.
 *
 * `BrandKey` is the set of marks Houston actually ships art for. Provider ids
 * come from pi-ai's catalog (~35 of them) plus Houston's local provider; most
 * arrive with NO curated override, so resolution must be tolerant of any string
 * and fall back to a monogram (see `monogramText`) for anything unmapped.
 */

import { BRAND_ALIASES } from "../../lib/providers/brand-aliases.ts";

/**
 * Every brand mark Houston ships a real SVG for. Each is a genuine single-color
 * brand logo sourced verbatim from models.dev (github.com/sst/models.dev, MIT)
 * via its per-provider logo endpoint (models.dev/logos/<id>.svg) — we ship NO
 * hand-approximated glyphs, since an inexact mark reads as a wrong logo.
 * Off-endpoint sourcing, same rule: `meta` carries models.dev's `llama` art,
 * `qwen` its `alibaba` art, and `opencode` the official O mark from
 * opencode.ai/brand — real marks under different ids, never approximations. An
 * id with no real mark anywhere falls back to the polished monogram.
 *
 * Keys are the provider ids that resolve to their OWN mark. Regional/variant ids
 * that models.dev serves the default for borrow a parent's identity through
 * `lib/providers/brand-aliases.ts`, the table the NAME path reads too.
 */
export type BrandKey =
  | "anthropic"
  | "cohere"
  | "meta"
  | "qwen"
  | "openai"
  | "google"
  | "google-vertex"
  | "github-copilot"
  | "openrouter"
  | "amazon-bedrock"
  | "opencode"
  | "opencode-go"
  | "openai-compatible"
  | "deepseek"
  | "minimax"
  | "mistral"
  | "groq"
  | "cerebras"
  | "huggingface"
  | "cloudflare-workers-ai"
  | "cloudflare-ai-gateway"
  | "xai"
  | "vercel"
  | "nvidia"
  | "together"
  | "moonshotai"
  | "zai"
  | "fireworks"
  | "xiaomi"
  | "azure-openai-responses";

export const BRAND_KEYS: ReadonlySet<BrandKey> = new Set([
  "anthropic",
  "cohere",
  "meta",
  "qwen",
  "openai",
  "google",
  "google-vertex",
  "github-copilot",
  "openrouter",
  "amazon-bedrock",
  "opencode",
  "opencode-go",
  "openai-compatible",
  "deepseek",
  "minimax",
  "mistral",
  "groq",
  "cerebras",
  "huggingface",
  "cloudflare-workers-ai",
  "cloudflare-ai-gateway",
  "xai",
  "vercel",
  "nvidia",
  "together",
  "moonshotai",
  "zai",
  "fireworks",
  "xiaomi",
  "azure-openai-responses",
]);

/**
 * Resolve an id to the brand mark it should draw, or `null` when it has no
 * bespoke art (the caller then renders the monogram tile). Identity match on a
 * `BrandKey` first, then the alias table.
 */
export function providerBrandKey(id: string): BrandKey | null {
  if (BRAND_KEYS.has(id as BrandKey)) return id as BrandKey;
  // An alias onto a provider Houston ships no art for resolves to no mark at
  // all: the monogram is the honest answer, never another brand's logo.
  const parent = BRAND_ALIASES[id];
  return parent !== undefined && BRAND_KEYS.has(parent as BrandKey)
    ? (parent as BrandKey)
    : null;
}

/**
 * The 1-2 character mark for the monogram fallback tile. A pre-shortened seed
 * (a coming-soon `mark` like "SQ") is kept verbatim; a longer seed (an id or a
 * provider name) collapses to its first letter. Punctuation and separators are
 * stripped so "ant-ling" -> "A" and "azure-openai-responses" -> "A".
 */
export function monogramText(seed: string): string {
  const cleaned = seed.replace(/[^\p{L}\p{N}]/gu, "");
  if (cleaned.length === 0) return "?";
  if (cleaned.length <= 2) return cleaned.toUpperCase();
  return cleaned.charAt(0).toUpperCase();
}
