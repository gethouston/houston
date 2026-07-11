/**
 * Pure formatting + ordering helpers for the AI models hub. No React, no
 * i18n, no store access — everything here is deterministic and unit-tested
 * (`app/tests/ai-hub-format.test.ts`), so the presentational components stay
 * thin and the tricky number/date/sort rules live in one testable place.
 */

import type {
  CatalogModel,
  CatalogOffer,
  LabId,
} from "../../lib/ai-hub/catalog-types.ts";
import { hasProviderBrandMark } from "../shell/provider-logo-map.ts";

/**
 * Token counts as compact labels: `200000 → "200K"`, `1048576 → "1M"`. Values
 * at or above a million read in `M` (one decimal, trailing `.0` dropped so
 * `1048576` reads "1M" not "1.0M"); thousands round to the nearest `K`.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "";
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${trimTrailingZeros(millions.toFixed(1))}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(Math.round(tokens));
}

/**
 * A per-1M-token price as money: `2.5 → "$2.50"`, `3 → "$3"`, `0.25 → "$0.25"`.
 * Sub-dollar prices keep three decimals so cheap models don't collapse to
 * `$0.00`; whole-dollar amounts drop the cents, and a lone tenth re-pads to a
 * cents pair so it always reads as a price. Returns `""` for a missing value.
 */
export function formatPrice(dollarsPerMillion: number | undefined): string {
  if (dollarsPerMillion == null || !Number.isFinite(dollarsPerMillion)) {
    return "";
  }
  if (dollarsPerMillion === 0) return "$0";
  const decimals = dollarsPerMillion < 1 ? 3 : 2;
  let str = trimTrailingZeros(dollarsPerMillion.toFixed(decimals));
  const [whole, frac] = str.split(".");
  if (frac?.length === 1) str = `${whole}.${frac}0`;
  return `$${str}`;
}

/**
 * A `YYYY-MM-DD` (or full ISO) release date as `"Nov 2025"`, formatted in the
 * caller's language. Parsed as UTC so the month never shifts across a timezone
 * boundary. Returns `""` for an absent or unparseable value.
 */
export function formatReleaseDate(
  iso: string | undefined,
  locale: string,
): string {
  if (!iso) return "";
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * The marketing model count, rounded DOWN to the nearest 50 (`438 → 400`), so
 * the copy reads as a confident round number ("400+") rather than an exact,
 * shifting figure. Shared by the hero subtitle and the directory search
 * placeholder so the two never disagree.
 */
export function roundedModelCount(count: number): number {
  return Math.floor(count / 50) * 50;
}

/**
 * Whether the rounded count is too small to make a "{{n}}+" claim. Below 100 the
 * rounded number would read "0+" or "50+", so the copy drops the number entirely
 * (few providers visible, e.g. the legacy engine's OAuth-only set).
 */
export function fewModels(count: number): boolean {
  return roundedModelCount(count) < 100;
}

/**
 * A model's friendly "good at" capabilities, in display order: reasoning first,
 * then image input. Only capabilities present in the data appear (no "fast" —
 * the snapshot carries no speed signal), so the row never claims what it can't.
 */
export function capabilityKeys(
  model: CatalogModel,
): ("reasoning" | "images")[] {
  const keys: ("reasoning" | "images")[] = [];
  if (model.reasoning) keys.push("reasoning");
  if (model.inputModalities.includes("image")) keys.push("images");
  return keys;
}

/** The lab that makes a model, as a brand proper noun (never translated). */
export function labName(lab: LabId): string {
  return LAB_NAMES[lab];
}

/**
 * The id whose brand mark represents this model. Normally the lab, but a lab
 * with no shipped mark (the catch-all `other`, mostly) falls back to the first
 * offering provider's logo — a real, recognizable mark beats a letter monogram.
 */
export function modelMarkId(model: CatalogModel): string {
  if (hasProviderBrandMark(model.lab)) return model.lab;
  return model.offers[0]?.providerId ?? model.lab;
}

const LAB_NAMES: Record<LabId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  qwen: "Qwen",
  deepseek: "DeepSeek",
  xai: "xAI",
  amazon: "Amazon",
  minimax: "MiniMax",
  zai: "Z.ai",
  moonshot: "Moonshot",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  other: "Other",
};

/**
 * Order a model's offers the way the "Get it through" section shows them:
 * connected providers first, then subscription offers, then the rest by
 * cheapest input price (offers without a price sort last within their tier).
 * `isConnected` is injected so the helper stays pure and testable.
 */
export function sortOffers(
  offers: readonly CatalogOffer[],
  isConnected: (offer: CatalogOffer) => boolean,
): CatalogOffer[] {
  return [...offers].sort((a, b) => {
    const connected = rank(isConnected(a)) - rank(isConnected(b));
    if (connected !== 0) return connected;
    const subscription = rank(a.subscription) - rank(b.subscription);
    if (subscription !== 0) return subscription;
    const priceA = a.costInput ?? Number.POSITIVE_INFINITY;
    const priceB = b.costInput ?? Number.POSITIVE_INFINITY;
    return priceA - priceB;
  });
}

/** `true` sorts before `false`. */
function rank(flag: boolean): number {
  return flag ? 0 : 1;
}

/** Drop a trailing `.0`/`.50` style zero run (and a bare trailing dot). */
function trimTrailingZeros(value: string): string {
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}
