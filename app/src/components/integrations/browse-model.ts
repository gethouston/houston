import type { IntegrationToolkit } from "@houston-ai/engine-client";

/**
 * The catalog-BROWSE pure layer: query filtering, A-Z ordering, Teams-allowlist
 * partitioning, category metadata and the first-paint caps. Split from `model.ts`
 * (provider/support/poll) so every surface applies the same rules; the section
 * grouping + curated Featured spotlight live beside it in `browse-sections.ts`.
 * All pure.
 */

/** Page size for the browse grid's "Load more" (catalog holds ~1000 apps). */
export const BROWSE_PAGE_SIZE = 100;

/**
 * Whether a toolkit matches an ALREADY-normalised (trimmed, lowercased) search
 * query: a case-insensitive substring over name, slug, and description. `""`
 * matches everything. Shared across the browse family (also `browse-sections`).
 */
export function matchesQuery(t: IntegrationToolkit, query: string): boolean {
  if (!query) return true;
  return (
    t.name.toLowerCase().includes(query) ||
    t.slug.toLowerCase().includes(query) ||
    (t.description ?? "").toLowerCase().includes(query)
  );
}

/** A-Z by app name, case-insensitive. The one ordering every browse list uses
 *  (shared across the browse family, also `browse-sections`). */
export function byNameAsc(
  a: IntegrationToolkit,
  b: IntegrationToolkit,
): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/**
 * The browse grid's contents: an active category narrows first; a search query
 * then matches name/slug/description case-insensitively. `connected` excludes
 * already-connected apps (empty set keeps them). Results sort A-Z by app name
 * AFTER filtering, so a user scanning 1000+ apps gets a predictable list rather
 * than the provider's usage-ranked order.
 */
export function browseCatalog(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  category: string;
  connected: ReadonlySet<string>;
}): IntegrationToolkit[] {
  // No-auth apps (web search, weather…) never surface in the catalog: there is
  // nothing to connect (a Connect button could only 400), so a row would just
  // be noise. They stay AGENT-facing instead — search stamps their matches
  // `connected`, so agents use the working ones directly.
  let filtered = opts.catalog.filter(
    (t) => !opts.connected.has(t.slug) && !t.noAuth,
  );
  if (opts.category !== "all") {
    filtered = filtered.filter((t) =>
      (t.categories ?? []).includes(opts.category),
    );
  }
  const q = opts.query.trim().toLowerCase();
  if (q) filtered = filtered.filter((t) => matchesQuery(t, q));
  return filtered.sort(byNameAsc);
}

/**
 * Max policy-blocked (locked) apps shown inline before the rest collapse into a
 * "+N more" line, so a tiny Teams allowlist can't bury the connectable apps.
 */
export const LOCKED_PREVIEW_CAP = 8;

/** Split by the Teams allowlist ceiling: `connectable` = may connect now,
 * `locked` = ceiling BLOCKS (shown as locked rows, never connectable). Both A-Z. */
export interface BrowseCatalogView {
  connectable: IntegrationToolkit[];
  locked: IntegrationToolkit[];
}

/**
 * Partition the browse catalog into the apps a member may connect and the apps a
 * Teams allowlist ceiling BLOCKS, after {@link browseCatalog}'s category + search
 * + connected-exclusion filter. `allowlist === null` means unrestricted (single-
 * player, or a Teams host with no ceiling), so nothing is ever locked. Both lists
 * keep the A-Z order.
 */
export function browseCatalogView(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  category: string;
  connected: ReadonlySet<string>;
  allowlist: string[] | null;
}): BrowseCatalogView {
  const { allowlist, ...browse } = opts;
  const results = browseCatalog(browse);
  if (allowlist === null) return { connectable: results, locked: [] };
  const allowed = new Set(allowlist);
  const connectable: IntegrationToolkit[] = [];
  const locked: IntegrationToolkit[] = [];
  for (const t of results) {
    (allowed.has(t.slug) ? connectable : locked).push(t);
  }
  return { connectable, locked };
}

/** Every category present in the catalog, sorted by display label. */
export function categoriesOf(catalog: IntegrationToolkit[]): string[] {
  const seen = new Set<string>();
  for (const t of catalog) {
    for (const c of t.categories ?? []) seen.add(c);
  }
  return [...seen].sort((a, b) =>
    categoryLabel(a).localeCompare(categoryLabel(b)),
  );
}

/** "developer-tools" -> "Developer tools". */
export function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " ");
}

/**
 * The set of toolkit slugs belonging to `category`, or `null` for the "all"
 * sentinel. Lets every surface filter its own app lists by category the same way
 * `browseCatalog` filters the browse grid — one rule, no drift.
 */
export function toolkitsInCategory(
  catalog: IntegrationToolkit[],
  category: string,
): Set<string> | null {
  if (category === "all") return null;
  const set = new Set<string>();
  for (const t of catalog) {
    if ((t.categories ?? []).includes(category)) set.add(t.slug);
  }
  return set;
}

/**
 * Which variant of a category-filtered app list to render. An empty *visible*
 * list is either genuinely empty (`"empty"`) or an active category filter hiding
 * every row (`"empty-category"`) — distinct copy so the empty state never claims
 * the list is empty when the user merely picked a category with no apps.
 * `"empty-category"` needs both a selected category AND some app overall.
 */
export type CategoryListView = "list" | "empty" | "empty-category";

export function categoryListView(args: {
  /** Rows still visible after the category filter. */
  visibleCount: number;
  /** Whether the list has any app at all, before the category filter. */
  hasAny: boolean;
  /** A specific category (not "all") is selected. */
  categoryFiltered: boolean;
}): CategoryListView {
  if (args.visibleCount > 0) return "list";
  return args.categoryFiltered && args.hasAny ? "empty-category" : "empty";
}

/** The section slug for toolkits with no category, sorted after every real one. */
export const UNCATEGORIZED = "__uncategorized";
