import type { ModelPriceTier } from "./types";

/** Number of filled `$` glyphs for a non-free tier. */
export const PRICE_TIER_DOLLARS: Record<
  Exclude<ModelPriceTier, "free">,
  number
> = {
  low: 1,
  mid: 2,
  high: 3,
};

/** CSS var carrying the accent color for a price tier (created by the tokens agent). */
export const PRICE_TIER_VAR: Record<ModelPriceTier, string> = {
  free: "var(--ht-price-free)",
  low: "var(--ht-price-low)",
  mid: "var(--ht-price-mid)",
  high: "var(--ht-price-high)",
};

/** `200000` → `"200K"`, `1000000` → `"1M"`. */
export function formatContext(tokens: number | undefined): string {
  if (tokens === undefined) return "·";
  if (tokens >= 1_000_000) return `${trim(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trim(tokens / 1_000)}K`;
  return String(tokens);
}

/** `0` → free (caller decides label); otherwise `"$3 / Mtok"`. */
export function formatPricePerMtok(
  price: number | undefined,
  freeLabel: string,
): string {
  if (price === undefined) return "·";
  if (price === 0) return freeLabel;
  return `$${trim(price)} / Mtok`;
}

function trim(n: number): string {
  return Number.parseFloat(n.toFixed(2)).toString();
}
