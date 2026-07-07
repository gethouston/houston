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

/**
 * Every brand mark Houston ships a real SVG for. Each is a genuine single-color
 * brand logo sourced verbatim from models.dev (github.com/sst/models.dev, MIT)
 * via its per-provider logo endpoint (models.dev/logos/<id>.svg) — we ship NO
 * hand-approximated glyphs, since an inexact mark reads as a wrong logo.
 * Off-endpoint sourcing, same rule: `meta` carries models.dev's `llama` art,
 * `qwen` its `alibaba` art, `ant-ling` the Ant Group mark from LobeHub's icon
 * set (github.com/lobehub/lobe-icons, MIT), and `opencode` the official O mark
 * from opencode.ai/brand — real marks under different ids, never
 * approximations. An id with no real mark anywhere falls back to the polished
 * monogram.
 *
 * Keys are the provider ids that resolve to their OWN mark. Regional/variant ids
 * that models.dev serves the default for reuse a parent via `BRAND_ALIASES`.
 */
export type BrandKey =
  | "anthropic"
  | "ant-ling"
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
  | "kimi-coding"
  | "zai"
  | "fireworks"
  | "xiaomi"
  | "azure-openai-responses";

export const BRAND_KEYS: ReadonlySet<BrandKey> = new Set([
  "anthropic",
  "ant-ling",
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
  "kimi-coding",
  "zai",
  "fireworks",
  "xiaomi",
  "azure-openai-responses",
]);

/**
 * Regional/variant ids and AI-hub lab ids that reuse a parent brand's mark, so a
 * "-cn" spin-off, a "-gateway"/"-workers" edge variant, or a lab alias needs no
 * bespoke art. Keyed by the incoming id, valued by the `BrandKey` it borrows.
 * Only aliases onto a REAL logo live here; an id with no real mark anywhere
 * carries no alias and cleanly falls to the monogram itself.
 */
export const BRAND_ALIASES: Readonly<Record<string, BrandKey>> = {
  // Variant ids models.dev serves the generic default for — reuse a parent
  // brand's real mark rather than a monogram.
  "openai-codex": "openai",
  "minimax-cn": "minimax",
  "moonshotai-cn": "moonshotai",
  "zai-coding-cn": "zai",
  "vercel-ai-gateway": "vercel",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
  // AI-hub lab ids (see `catalog-lab.ts`) that differ from the provider id.
  // Most lab ids ARE provider ids (anthropic, openai, mistral, deepseek, xai,
  // minimax, zai, nvidia, meta, qwen, cohere, ...) so `providerBrandKey`
  // resolves them directly; only the ids that spell the brand differently need
  // an alias. The catch-all `other` lab has no mark of its own — the hub falls
  // back to an offering provider's logo there (see `modelMarkId`).
  gemini: "google",
  amazon: "amazon-bedrock",
  moonshot: "moonshotai",
  "meta-llama": "meta",
  llama: "meta",
};

/**
 * Resolve an id to the brand mark it should draw, or `null` when it has no
 * bespoke art (the caller then renders the monogram tile). Identity match on a
 * `BrandKey` first, then the alias table.
 */
export function providerBrandKey(id: string): BrandKey | null {
  if (BRAND_KEYS.has(id as BrandKey)) return id as BrandKey;
  return BRAND_ALIASES[id] ?? null;
}

/** True when Houston ships a bespoke brand mark for this id (vs a monogram). */
export function hasProviderBrandMark(id: string): boolean {
  return providerBrandKey(id) !== null;
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
