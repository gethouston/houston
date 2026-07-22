import type {
  Connection,
  IntegrationAppStatus,
  Toolkit,
  ToolMatch,
} from "./types";

/**
 * The Composio search algorithm, extracted from the adapter so composio.ts stays
 * request-shaping + port-mapping and this holds the discovery policy (and its
 * pure, unit-testable pieces).
 *
 * Discovery has two failure modes Composio's full-text `/tools` search cannot
 * cover on its own, so search runs THREE lookups and merges them:
 *
 *  1. A query scoped to the user's CONNECTED toolkits — high precision for apps
 *     they already have (Composio ranks unrelated tools above the obvious match
 *     unqualified). When it scores zero, degrade to LISTING those toolkits'
 *     actions so an everyday phrasing still lands on a real slug.
 *  2. A GLOBAL query — so a connected-Gmail user asking for Google Sheets still
 *     discovers it. This ALWAYS runs; it is never short-circuited by (1) (the
 *     regression this module fixes: a connected user could not discover any new
 *     app because a scoped hit returned early).
 *  3. Catalog resolution — Composio's action search scores ~zero for plain app
 *     names, so an app named in the query is resolved against the toolkits
 *     catalog to a real slug and surfaced as a toolkit-level entry, even when no
 *     action scored. This is what makes "connect to Google Sheets" work.
 *
 * Every returned entry carries its IntegrationAppStatus, derived from the acting
 * user's active connections (the direct adapter cannot produce `blocked` — that
 * ceiling lives in the closed gateway — nor `unknown`, which is the empty case).
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

/** Active-connection lookup for one search: which toolkit slugs are connected. */
export function activeToolkitSlugs(connections: Connection[]): string[] {
  return [
    ...new Set(
      connections.filter((c) => c.status === "active").map((c) => c.toolkit),
    ),
  ];
}

const isConnectedIn = (slugs: string[], toolkit: string): boolean =>
  slugs.some((s) => s.toLowerCase() === toolkit.toLowerCase());

/** The catalog's no-auth toolkit slugs, lowercased: these need no connection —
 *  their tools work as-is, so search treats them as `connected` (the agent
 *  must USE them, never offer a request_connection that can only 400). */
function noAuthSlugs(catalog: Toolkit[]): Set<string> {
  return new Set(
    catalog.filter((tk) => tk.noAuth).map((tk) => tk.slug.toLowerCase()),
  );
}

/** Stamp `connected` + `status` on a raw action match: an active connection or
 *  a no-auth toolkit (nothing to connect) both mean "usable now". */
function annotate(
  match: ToolMatch,
  connectedSlugs: string[],
  noAuth: ReadonlySet<string>,
): ToolMatch {
  const connected =
    isConnectedIn(connectedSlugs, match.toolkit) ||
    noAuth.has(match.toolkit.toLowerCase());
  const status: IntegrationAppStatus = connected ? "connected" : "connectable";
  return { ...match, connected, status };
}

export interface SearchDeps {
  listConnections(): Promise<Connection[]>;
  /** One `/tools` query (already mapped to raw ToolMatch, no status/connected). */
  queryTools(query: Record<string, string>): Promise<ToolMatch[]>;
  /** The (cached) toolkits catalog for name resolution. */
  catalog(): Promise<Toolkit[]>;
}

/**
 * Run the merged search. Order: scoped/listing action matches (connected apps)
 * first, then global action matches (deduped by action slug), then catalog
 * toolkit-level entries for any resolved app not already represented by an
 * action match.
 */
export async function searchComposio(
  deps: SearchDeps,
  query: string,
): Promise<ToolMatch[]> {
  const slugs = activeToolkitSlugs(await deps.listConnections());
  const scopedSlug = slugs.join(",");

  const [scoped, global, catalog] = await Promise.all([
    slugs.length > 0
      ? deps.queryTools({ query, limit: "10", toolkit_slug: scopedSlug })
      : Promise.resolve<ToolMatch[]>([]),
    deps.queryTools({ query, limit: "10" }),
    deps.catalog(),
  ]);

  // A zero-hit scoped query still degrades to listing the connected toolkits'
  // actions (Composio's naive full-text scores everyday phrasings at zero), so
  // the model gets a real slug rather than a dead end.
  const scopedListed =
    slugs.length > 0 && scoped.length === 0
      ? await deps.queryTools({ limit: "50", toolkit_slug: scopedSlug })
      : [];

  const noAuth = noAuthSlugs(catalog);
  const out: ToolMatch[] = [];
  const seenActions = new Set<string>();
  const push = (m: ToolMatch) => {
    const key = m.action.toLowerCase();
    if (seenActions.has(key)) return;
    seenActions.add(key);
    out.push(annotate(m, slugs, noAuth));
  };
  // Scoped (or its listing fallback) first — connected apps, highest precision.
  for (const m of scoped.length > 0 ? scoped : scopedListed) push(m);
  // Then global — NEVER dropped when scoped hit (the short-circuit fix).
  for (const m of global) push(m);

  // Catalog: surface every resolved app that has no action match yet, so the
  // model always learns the slug to offer via request_connection (or, for a
  // no-auth app, to use directly — those read `connected`).
  const represented = new Set(out.map((m) => m.toolkit.toLowerCase()));
  for (const tk of resolveCatalogToolkits(catalog, query)) {
    if (represented.has(tk.slug.toLowerCase())) continue;
    represented.add(tk.slug.toLowerCase());
    const connected =
      isConnectedIn(slugs, tk.slug) || noAuth.has(tk.slug.toLowerCase());
    out.push({
      action: "",
      toolkit: tk.slug,
      description: tk.description ? `${tk.name}: ${tk.description}` : tk.name,
      connected,
      status: connected ? "connected" : "connectable",
    });
  }
  return out;
}
