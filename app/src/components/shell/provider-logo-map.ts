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
 * Every brand mark Houston ships a bespoke SVG for. These are the genuinely
 * correct, pre-existing brand logos only — we deliberately ship NO approximate
 * hand-authored marks for other providers, since an inexact glyph reads as a
 * wrong logo. Anything not listed here falls back to the polished monogram.
 */
export type BrandKey =
  | "anthropic"
  | "openai"
  | "google"
  | "github-copilot"
  | "openrouter"
  | "amazon-bedrock"
  | "opencode"
  | "openai-compatible"
  | "deepseek"
  | "minimax";

export const BRAND_KEYS: ReadonlySet<BrandKey> = new Set([
  "anthropic",
  "openai",
  "google",
  "github-copilot",
  "openrouter",
  "amazon-bedrock",
  "opencode",
  "openai-compatible",
  "deepseek",
  "minimax",
]);

/**
 * Regional/variant ids and AI-hub lab ids that reuse a parent brand's mark, so a
 * "-cn" spin-off or a lab alias needs no bespoke art. Keyed by the incoming id,
 * valued by the `BrandKey` it borrows. Only aliases onto a REAL logo live here —
 * variants of providers we monogram (moonshot, zai, vercel, cloudflare, ...)
 * carry no alias and cleanly fall to the monogram themselves.
 */
export const BRAND_ALIASES: Readonly<Record<string, BrandKey>> = {
  // Provider-id variants from pi's catalog.
  "google-vertex": "google",
  "opencode-go": "opencode",
  "openai-codex": "openai",
  "minimax-cn": "minimax",
  // AI-hub lab ids (see `catalog-lab.ts`) that differ from the provider id.
  gemini: "google",
  amazon: "amazon-bedrock",
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
