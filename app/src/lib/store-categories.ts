import type { StoreCategory as StoreCategoryEntry } from "@houston-ai/engine-client";

/**
 * The Agent Store's seeded category vocabulary (see the store's `db/seed.ts`).
 * The publish wizard shows these as a select, labelled from i18n — the slug is
 * the stable contract the store validates against; the label is translated.
 *
 * This static list stays the PUBLISH-time contract (the select the wizard
 * offers). The BROWSE filter's runtime vocabulary now comes from the gateway
 * (`GET /categories` via `fetchStoreCategories`), which may seed new slugs
 * ahead of a client release; `resolveStoreCategoryLabel` bridges the two —
 * seeded slugs reuse these translated labels, unknown gateway slugs fall back
 * to the gateway-provided display name.
 *
 * Keep this list in lockstep with the store seed. A slug the store hasn't
 * seeded would be rejected at publish time, so drift is a publish-blocking bug,
 * not a silent mislabel.
 */
export const STORE_CATEGORIES = [
  "writing",
  "productivity",
  "research",
  "marketing",
  "sales",
  "coding",
  "design",
  "data",
  "education",
  "finance",
  "customer-support",
  "personal",
  "fun",
  "other",
] as const;

export type StoreCategory = (typeof STORE_CATEGORIES)[number];

/** True when `slug` is one of the store's seeded categories. */
export function isStoreCategory(slug: string): slug is StoreCategory {
  return (STORE_CATEGORIES as readonly string[]).includes(slug);
}

/** The i18n key for a category's translated label (in the `portable` namespace).
 *  Returns the literal union so the typed `t()` accepts it directly. */
export function storeCategoryLabelKey(
  slug: StoreCategory,
): `publish.categories.${StoreCategory}` {
  return `publish.categories.${slug}`;
}

/**
 * How to label a runtime category entry from the gateway's `GET /categories`.
 * A seeded slug carries an i18n key (the SAME `portable:publish.categories.*`
 * entry the publish wizard uses); an unknown gateway slug has no key, so the
 * caller renders the gateway-provided `name` verbatim. Discriminated so the
 * consumer never has to guess which branch it got. */
export type StoreCategoryLabel =
  | { i18nKey: `publish.categories.${StoreCategory}` }
  | { text: string };

/** Resolve a gateway category entry to how it should be labelled (per above). */
export function resolveStoreCategoryLabel(
  entry: StoreCategoryEntry,
): StoreCategoryLabel {
  return isStoreCategory(entry.slug)
    ? { i18nKey: storeCategoryLabelKey(entry.slug) }
    : { text: entry.name };
}
