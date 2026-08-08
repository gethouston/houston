import { normalizeAppName, resolveScopeRows } from "./scope-resolve";
import type { Toolkit } from "./types";

/**
 * Catalog name resolution for Composio search: turning an app-naming query or
 * an explicit app scope into real toolkit slugs. Pure and unit-tested; the
 * merge policy that consumes these lives in composio-search.ts.
 */

export { normalizeAppName } from "./scope-resolve";

/** Every concatenation of a CONTIGUOUS run of query tokens (runs capped at 4):
 *  "add to google sheets" → google, sheets, googlesheets, … An app counts as
 *  "named in the query" only when its normalized name/slug equals one of these
 *  whole-token runs — never a substring inside a longer word, which is how
 *  "inbox" used to resolve the app "box" and suppress the connected-apps
 *  fallback for a query that named no app at all. */
function tokenRuns(query: string): Set<string> {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const runs = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    let run = "";
    for (let j = i; j < Math.min(i + 4, tokens.length); j++) {
      run += tokens[j];
      runs.add(run);
    }
  }
  return runs;
}

/**
 * Resolve the toolkits an app-naming query plausibly refers to, against the
 * catalog. A toolkit matches when its normalized name OR slug (length >= 2)
 * equals a contiguous token run of the query. Ordered longest-match-first
 * (the most specific name wins) and capped so a broad query cannot flood the
 * result.
 */
export function resolveCatalogToolkits(
  catalog: Toolkit[],
  query: string,
  limit = 3,
): Toolkit[] {
  const runs = tokenRuns(query);
  if (runs.size === 0) return [];
  const hits = catalog.filter((tk) => {
    const name = normalizeAppName(tk.name);
    const slug = normalizeAppName(tk.slug);
    return (
      (name.length >= 2 && runs.has(name)) ||
      (slug.length >= 2 && runs.has(slug))
    );
  });
  hits.sort(
    (a, b) => normalizeAppName(b.name).length - normalizeAppName(a.name).length,
  );
  return hits.slice(0, limit);
}

/**
 * Resolve an EXPLICIT app scope (search's `app` argument) to catalog toolkits
 * via the shared provider-neutral rules (scope-resolve.ts): an exact
 * normalized slug/name match wins outright (no length guard — "HR" must
 * resolve when passed exactly), else loose both-way substring containment
 * yields only the single closest candidate.
 */
export function resolveScopeToolkits(
  catalog: Toolkit[],
  app: string,
): Toolkit[] {
  return resolveScopeRows(catalog, app);
}
