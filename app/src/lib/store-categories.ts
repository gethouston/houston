/**
 * The Agent Store's seeded category vocabulary (see the store's `db/seed.ts`).
 * The publish wizard shows these as a select, labelled from i18n — the slug is
 * the stable contract the store validates against; the label is translated.
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
