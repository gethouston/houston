import type { ModelPriceTier } from "./types";

/** Number of filled `$` glyphs for a non-free tier (also the info-panel scale). */
export const PRICE_TIER_DOLLARS: Record<
  Exclude<ModelPriceTier, "free">,
  number
> = {
  low: 1,
  mid: 2,
  high: 3,
};

/** Coarse context bucket: 1 = Low, 2 = Medium, 3 = High. */
export type ContextLevel = 1 | 2 | 3;

/**
 * Bucket a context window into three ascending levels for the info panel's
 * bar indicator. Thresholds are deliberately coarse: `< 128K` tokens reads as
 * Low, `<= 400K` as Medium, anything larger as High. Unknown windows fall back
 * to Low so the indicator never renders empty.
 */
export function contextLevel(tokens: number | undefined): ContextLevel {
  if (tokens === undefined) return 1;
  if (tokens < 128_000) return 1;
  if (tokens <= 400_000) return 2;
  return 3;
}
