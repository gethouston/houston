/**
 * The curated ORDER for the browse catalog's category sections. Split from
 * `browse-sections.ts` to hold the file-size line; pure, node-tested through
 * `browse-sections`' section sort. Re-exported via the barrel.
 */

/**
 * The hand-picked category ordering for the browse sections. Houston serves
 * NON-technical knowledge workers, so the everyday categories they live in
 * greet a first-time user BEFORE the niche and technical ones — the raw
 * app-count ranking floated "Developer tools" to the top because the catalog
 * is dev/AI-heavy. Categories listed here sort in THIS order, ahead of every
 * non-listed category (which then falls through to the app-count-DESC
 * ranking). Matching is NORMALIZED (see {@link categoryRank}) so slug-spelling
 * variants ("ads-and-conversion" vs "ads-&-conversion") still rank; an entry
 * absent from the live catalog is harmless — it simply never matches.
 * Deliberately ABSENT: `developer-tools` and the other technical categories,
 * so they never lead. Order here IS the display order.
 */
export const CATEGORY_PRIORITY: readonly string[] = [
  "social-media-accounts",
  "file-management-and-storage",
  "spreadsheets",
  "team-chat",
  "team-collaboration",
  "productivity",
  "ai-meeting-assistants",
  "ads-and-conversion",
  "notes",
  "signatures",
];

/** Collapse a category slug to a spelling-insensitive key: lowercase, `&` →
 *  "and", every non-alphanumeric dropped — so `ads-&-conversion`,
 *  `ads-and-conversion`, and "Ads & conversion" all rank identically. */
function normalizeCategory(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const CATEGORY_RANK: ReadonlyMap<string, number> = new Map(
  CATEGORY_PRIORITY.map((slug, i) => [normalizeCategory(slug), i]),
);

/** The category's curated rank (0 = first), or `undefined` for a non-priority
 *  category (ranks after every curated one, by app count). O(1) per lookup. */
export function categoryRank(category: string): number | undefined {
  return CATEGORY_RANK.get(normalizeCategory(category));
}
