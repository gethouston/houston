import type { Toolkit } from "./types";

/**
 * Catalog name resolution for Composio search: turning an app-naming query or
 * an explicit app scope into real toolkit slugs. Pure and unit-tested; the
 * merge policy that consumes these lives in composio-search.ts.
 */

/** Normalize an app name/slug/query for substring matching: lowercase, drop
 *  every non-alphanumeric char so "Google Sheets", "google-sheets" and
 *  "googlesheets" all collapse to one comparable form. */
export function normalizeAppName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolve the toolkits an app-naming query plausibly refers to, against the
 * catalog. A toolkit matches when its normalized name OR slug (length >= 3, to
 * avoid trivial collisions) is a substring of the normalized query. Ordered
 * longest-match-first (the most specific name wins) and capped so a broad query
 * cannot flood the result.
 */
export function resolveCatalogToolkits(
  catalog: Toolkit[],
  query: string,
  limit = 3,
): Toolkit[] {
  const q = normalizeAppName(query);
  if (!q) return [];
  const hits = catalog.filter((tk) => {
    const name = normalizeAppName(tk.name);
    const slug = normalizeAppName(tk.slug);
    return (
      (name.length >= 3 && q.includes(name)) ||
      (slug.length >= 3 && q.includes(slug))
    );
  });
  hits.sort(
    (a, b) => normalizeAppName(b.name).length - normalizeAppName(a.name).length,
  );
  return hits.slice(0, limit);
}

/**
 * Resolve an EXPLICIT app scope (search's `app` argument — a loose name or slug
 * the model heard from the user) to catalog toolkits. Exact normalized matches
 * win outright; otherwise substring containment EITHER way ("google sheet" ⊂
 * "googlesheets") yields only the SINGLE closest-length candidate — a loose
 * scope ("hub" ⊂ github AND hubspot) must never hard-scope to several
 * unrelated apps, which would recreate the very ranking pollution the scope
 * exists to eliminate.
 */
export function resolveScopeToolkits(
  catalog: Toolkit[],
  app: string,
  limit = 3,
): Toolkit[] {
  const scope = normalizeAppName(app);
  if (scope.length < 3) return [];
  const exact = catalog.filter(
    (tk) =>
      normalizeAppName(tk.slug) === scope ||
      normalizeAppName(tk.name) === scope,
  );
  if (exact.length > 0) return exact.slice(0, limit);
  const near = catalog.filter((tk) =>
    [normalizeAppName(tk.name), normalizeAppName(tk.slug)].some(
      (s) => s.length >= 3 && (s.includes(scope) || scope.includes(s)),
    ),
  );
  near.sort(
    (a, b) =>
      Math.abs(normalizeAppName(a.name).length - scope.length) -
      Math.abs(normalizeAppName(b.name).length - scope.length),
  );
  return near.slice(0, 1);
}
