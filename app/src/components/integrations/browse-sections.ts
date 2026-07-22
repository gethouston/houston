import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  byNameAsc,
  categoryLabel,
  matchesQuery,
  UNCATEGORIZED,
} from "./browse-model.ts";
import { categoryRank } from "./category-priority.ts";

/**
 * The catalog-BROWSE section layer: grouping the connectable catalog into the
 * size-ranked category sections of the "plane" page, plus the curated "Most
 * used" spotlight pinned above them. Split from `browse-model.ts` (the
 * filter/category layer) so each file stays within the file-size law; both are
 * pure and share the same matching/ordering helpers.
 */

/** The section slug for the curated "Most used" spotlight, pinned FIRST on the
 * at-rest landing view (before any search or category narrowing). */
export const MOST_USED = "__mostUsed";

/**
 * The curated, ORDERED "Most used" spotlight for our non-technical audience —
 * the everyday apps most people already live in, pinned above the size-ranked
 * category sections so "Developer tools" never greets a first-time user.
 *
 * Committed data on purpose, NOT the live API sort. Composio's toolkits
 * endpoint DOES expose a usage sort (`GET /api/v3/toolkits?sort_by=usage`,
 * verified 2026-07-22 — it is also the endpoint's default order), but it ranks
 * by usage across Composio's whole customer base, which is developers: its top
 * ten includes github, supabase and perplexityai — exactly the apps this
 * catalog's curated ordering exists to bury for our audience (see
 * `category-priority.ts`). Membership therefore stays hand-picked, while the
 * ORDER follows those same apps' relative ranks from that verified usage data,
 * so the section is honestly "most used" without the developer-heavy tail.
 *
 * These are Composio toolkit slugs (lowercase, no separators); matched
 * case-insensitively and any that aren't in the live catalog simply drop out.
 * Order here IS the display order (curated, not A-Z). The trailing numbers are
 * each app's rank in Composio's usage-sorted catalog on 2026-07-22.
 */
export const MOST_USED_SLUGS: readonly string[] = [
  "gmail", // 0
  "googlecalendar", // 3
  "notion", // 4
  "googlesheets", // 5
  "slack", // 6
  "outlook", // 8
  "twitter", // 10 (X)
  "googledrive", // 11
  "googledocs", // 12
  "asana", // 38
  "shopify", // 40
  "linkedin", // 41
  "calendly", // 47
  "trello", // 48
  "dropbox", // 66
  "whatsapp", // 88
  "zoom", // 103
  "canva", // 142
  "instagram", // 608
];

/**
 * The catalog's most-used toolkits: those whose slug is in
 * {@link MOST_USED_SLUGS} and not already connected, in MOST_USED_SLUGS order
 * (curated usage rank, NOT A-Z). Missing apps drop out. Most-used apps still
 * appear in their own category sections too — this is a spotlight, not a move.
 */
function mostUsedToolkits(
  catalog: IntegrationToolkit[],
  connected: ReadonlySet<string>,
): IntegrationToolkit[] {
  const bySlug = new Map<string, IntegrationToolkit>();
  for (const t of catalog) bySlug.set(t.slug.toLowerCase(), t);
  const mostUsed: IntegrationToolkit[] = [];
  for (const slug of MOST_USED_SLUGS) {
    const tk = bySlug.get(slug);
    if (tk && !connected.has(tk.slug)) mostUsed.push(tk);
  }
  return mostUsed;
}

/**
 * Bounds the row count at first paint: each browse section renders at most this
 * many rows until the user expands it, and every section expands independently.
 */
export const SECTION_PREVIEW_CAP = 6;

/** One category's slice: `category` is the primary slug (or {@link UNCATEGORIZED}),
 * `connectable` the section's apps A-Z by name. */
export interface CatalogSection {
  category: string;
  connectable: IntegrationToolkit[];
}

/**
 * Group the browse catalog into category sections for the "plane" page: exclude
 * already-`connected` apps, apply {@link matchesQuery}'s search filter, then bucket
 * the survivors two ways depending on the view:
 *
 *  - **Un-narrowed ("all")** — bucket by PRIMARY category (`categories[0]`;
 *    missing/empty/falsy collapses to {@link UNCATEGORIZED}) so each app gets exactly
 *    ONE home section even when it carries several categories.
 *  - **Narrowed to one category (`category` set)** — ANY-match: every app whose
 *    `categories` CONTAINS that slug lands in that single section, so a
 *    secondary-category app is findable under the filter and the rendered rows equal
 *    {@link browseCatalogView}'s `connectable` (the "Available" chip count). This
 *    mirrors the installed side ({@link toolkitsInCategory}, also any-match).
 *
 * Apps sort A-Z within a section. Sections order MAINSTREAM-FIRST for our
 * non-technical audience: the curated {@link CATEGORY_PRIORITY} categories come
 * first in that order (only those present with apps), then every remaining
 * category by app count DESC (tie-breaking on `categoryLabel` ascending), with
 * {@link UNCATEGORIZED} pinned last — so a small "Productivity" leads a huge
 * "Developer tools" instead of the raw size ranking floating dev/AI apps up.
 * Empty sections drop.
 *
 * On the at-rest landing view (NO search query AND NO single-category narrowing) a
 * curated {@link MOST_USED} section is pinned FIRST when non-empty, so everyday
 * apps greet a first-time user instead of the size-ranked "Developer tools".
 * Most-used apps stay in their normal category sections too (a spotlight, not a
 * move).
 */
export function groupCatalogByCategory(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  connected: ReadonlySet<string>;
  /** Narrow to ONE category slug, any-match ("all" = every section, primary-match). */
  category?: string;
}): CatalogSection[] {
  const q = opts.query.trim().toLowerCase();
  const only = opts.category && opts.category !== "all" ? opts.category : null;
  const buckets = new Map<string, IntegrationToolkit[]>();
  for (const t of opts.catalog) {
    if (opts.connected.has(t.slug)) continue;
    // No-auth apps never join a category bucket — a bucket row carries the
    // Connect `+`, and connecting a no-auth app can only fail (there is no
    // account). They stay agent-facing: search stamps their matches connected.
    if (t.noAuth) continue;
    if (!matchesQuery(t, q)) continue;
    let category: string;
    if (only) {
      // Narrowed: any-match into the single selected section, so rendered rows
      // equal browseCatalogView/availableCount and secondary-category apps show.
      if (!(t.categories ?? []).includes(only)) continue;
      category = only;
    } else {
      // Un-narrowed: PRIMARY-category bucketing gives each app one home section.
      category = t.categories?.[0] || UNCATEGORIZED;
    }
    const bucket = buckets.get(category);
    if (bucket) bucket.push(t);
    else buckets.set(category, [t]);
  }
  const sections: CatalogSection[] = [];
  for (const [category, connectable] of buckets) {
    connectable.sort(byNameAsc);
    sections.push({ category, connectable });
  }
  sections.sort((a, b) => {
    if (a.category === UNCATEGORIZED) return 1;
    if (b.category === UNCATEGORIZED) return -1;
    const rankA = categoryRank(a.category);
    const rankB = categoryRank(b.category);
    // Curated mainstream categories lead, in CATEGORY_PRIORITY order, ahead of
    // every non-priority one regardless of size.
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    // Neither is curated: fall back to app-count DESC, label tiebreak.
    const bySize = b.connectable.length - a.connectable.length;
    if (bySize !== 0) return bySize;
    return categoryLabel(a.category).localeCompare(categoryLabel(b.category));
  });
  // Spotlight only on the at-rest landing view — a search or category pick is a
  // deliberate narrowing the curated list would fight.
  if (!q && !only) {
    const mostUsed = mostUsedToolkits(opts.catalog, opts.connected);
    if (mostUsed.length > 0) {
      sections.unshift({ category: MOST_USED, connectable: mostUsed });
    }
  }
  return sections;
}

/**
 * The primary-category slugs present in the browse catalog (connected apps
 * excluded), sorted A-Z by display label with {@link UNCATEGORIZED} pinned
 * last — the option set for the category filter beside the search field. The
 * dropdown orders alphabetically (a user LOOKS UP a category by name there)
 * even though the page's sections order by size. The curated {@link MOST_USED}
 * spotlight is not a real category, so it never leaks into the options. The
 * consumer prepends its "all" entry and labels {@link UNCATEGORIZED} itself.
 */
export function catalogCategorySlugs(opts: {
  catalog: IntegrationToolkit[];
  connected: ReadonlySet<string>;
}): string[] {
  return groupCatalogByCategory({ ...opts, query: "" })
    .map((s) => s.category)
    .filter((c) => c !== MOST_USED)
    .sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return categoryLabel(a).localeCompare(categoryLabel(b));
    });
}
