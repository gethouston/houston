import {
  activeToolkitSlugs,
  annotate,
  isConnectedIn,
  multiAccountsByToolkit,
  noAuthSlugs,
} from "./composio-annotate";
import {
  resolveCatalogToolkits,
  resolveScopeToolkits,
} from "./composio-resolve";
import type { Connection, Toolkit, ToolMatch } from "./types";

/**
 * The Composio search algorithm, extracted from the adapter so composio.ts stays
 * request-shaping + port-mapping and this holds the discovery policy (and its
 * pure, unit-testable pieces). Status stamping lives in composio-annotate.ts.
 *
 * Discovery is PROGRESSIVE (PRODUCT-1274): a query that names an app gets that
 * app's actions scoped hard to it, never a globally ranked list where unrelated
 * connected apps drown the named one out. The lookups, merged in this order:
 *
 *  1. NAMED-APP lookups — the explicit `app` scope (the agent's hard filter),
 *     or apps resolved from the query text. Each runs the query scoped to that
 *     toolkit; a zero score degrades to LISTING the toolkit's actions when the
 *     scope is explicit (Composio's full-text scores everyday phrasings at
 *     zero; direct toolkit retrieval is its own deterministic fallback). With
 *     an explicit scope these lookups are the WHOLE result.
 *  2. A query scoped to the user's CONNECTED toolkits — high precision for apps
 *     they already have. When it scores zero, degrade to listing those
 *     toolkits' actions so an everyday phrasing still lands on a real slug.
 *  3. A GLOBAL query — so a connected-Gmail user asking for Google Sheets still
 *     discovers it. This ALWAYS runs; it is never short-circuited by (2).
 *  4. Catalog resolution — an app named in the query is resolved against the
 *     toolkits catalog and surfaced as a toolkit-level entry even when no
 *     action scored, so the model always learns the slug for
 *     request_connection. This is what makes "connect to Google Sheets" work.
 */

export interface SearchDeps {
  listConnections(): Promise<Connection[]>;
  /** One `/tools` query (already mapped to raw ToolMatch, no status/connected). */
  queryTools(query: Record<string, string>): Promise<ToolMatch[]>;
  /** The (cached) toolkits catalog for name resolution. */
  catalog(): Promise<Toolkit[]>;
}

/** One named-app lookup: the query scoped hard to the toolkit. A zero score
 *  with `list` degrades to retrieving the toolkit's actions directly — the
 *  deterministic fallback for a named app whose actions full-text missed. */
async function namedAppLookup(
  deps: SearchDeps,
  query: string,
  slug: string,
  list: boolean,
): Promise<ToolMatch[]> {
  const scoped = await deps.queryTools({
    query,
    limit: "10",
    toolkit_slug: slug,
  });
  if (scoped.length > 0 || !list) return scoped;
  return deps.queryTools({ limit: "50", toolkit_slug: slug });
}

/**
 * Run the merged search. `app` (optional) is the agent's explicit scope: the
 * result is then ONLY that app's actions (plus its toolkit-level entry), or —
 * when the scope resolves to nothing in the catalog (a typo, a guess) — the
 * full merged search, never a false "no such app" the query could still answer.
 */
export async function searchComposio(
  deps: SearchDeps,
  query: string,
  app?: string,
): Promise<ToolMatch[]> {
  const [connections, catalog] = await Promise.all([
    deps.listConnections(),
    deps.catalog(),
  ]);
  const slugs = activeToolkitSlugs(connections);
  const multiAccounts = multiAccountsByToolkit(connections);
  const noAuth = noAuthSlugs(catalog);

  const out: ToolMatch[] = [];
  const seenActions = new Set<string>();
  const push = (m: ToolMatch) => {
    const key = m.action.toLowerCase();
    if (seenActions.has(key)) return;
    seenActions.add(key);
    out.push(annotate(m, slugs, noAuth, multiAccounts));
  };
  // Toolkit-level entries for resolved apps with no action match, so the model
  // always learns the slug to offer via request_connection (or, for a no-auth
  // app, to use directly — those read `connected`).
  const pushToolkitRows = (toolkits: Toolkit[]) => {
    const represented = new Set(out.map((m) => m.toolkit.toLowerCase()));
    for (const tk of toolkits) {
      if (represented.has(tk.slug.toLowerCase())) continue;
      represented.add(tk.slug.toLowerCase());
      const connected =
        isConnectedIn(slugs, tk.slug) || noAuth.has(tk.slug.toLowerCase());
      const accounts = multiAccounts.get(tk.slug.toLowerCase());
      out.push({
        action: "",
        toolkit: tk.slug,
        description: tk.description ? `${tk.name}: ${tk.description}` : tk.name,
        connected,
        status: connected ? "connected" : "connectable",
        ...(accounts ? { accounts } : {}),
      });
    }
  };

  // Explicit scope: a HARD filter — only the named app's actions come back,
  // with the deterministic listing fallback. An unresolvable scope falls
  // through to the merged search below instead of claiming "no such app".
  if (app) {
    const scoped = resolveScopeToolkits(catalog, app);
    if (scoped.length > 0) {
      const results = await Promise.all(
        scoped.map((tk) => namedAppLookup(deps, query, tk.slug, true)),
      );
      for (const matches of results) for (const m of matches) push(m);
      pushToolkitRows(scoped);
      return out;
    }
  }

  const named = resolveCatalogToolkits(catalog, query);
  const scopedSlug = slugs.join(",");
  const [namedResults, scoped, global] = await Promise.all([
    // Query-resolved apps get the scoped query but NOT the listing fallback:
    // a loose text match ("linear" inside "linear regression") must not flood
    // the result — the toolkit row + an `app`-scoped re-search cover that.
    Promise.all(named.map((tk) => namedAppLookup(deps, query, tk.slug, false))),
    slugs.length > 0
      ? deps.queryTools({ query, limit: "10", toolkit_slug: scopedSlug })
      : Promise.resolve<ToolMatch[]>([]),
    deps.queryTools({ query, limit: "10" }),
  ]);

  // A zero-hit scoped query still degrades to listing the connected toolkits'
  // actions (Composio's naive full-text scores everyday phrasings at zero), so
  // the model gets a real slug rather than a dead end.
  const scopedListed =
    slugs.length > 0 && scoped.length === 0
      ? await deps.queryTools({ limit: "50", toolkit_slug: scopedSlug })
      : [];

  // Named apps first (the app the user actually said), then scoped (or its
  // listing fallback), then global — NEVER dropped when scoped hit.
  for (const matches of namedResults) for (const m of matches) push(m);
  for (const m of scoped.length > 0 ? scoped : scopedListed) push(m);
  for (const m of global) push(m);
  pushToolkitRows(named);
  return out;
}
