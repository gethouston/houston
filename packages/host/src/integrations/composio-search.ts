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
import type { ProviderSearchResult } from "./provider";
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
 *     scope is explicit OR the named app is CONNECTED (Composio's full-text
 *     scores everyday phrasings at zero; direct toolkit retrieval is its own
 *     deterministic fallback — "En Clockify, dime cuánto tiempo he registrado"
 *     must surface Clockify's real slugs in THIS search, not after a scoped
 *     re-search). With an explicit scope these lookups are the WHOLE result.
 *  2. A query scoped to the user's CONNECTED toolkits — high precision for apps
 *     they already have. When it scores zero, degrade to listing those
 *     toolkits' actions so an everyday phrasing still lands on a real slug.
 *  3. Query-resolved apps that are NOT connected — after the connected results
 *     (a loose text match must never outrank the app the user actually uses)
 *     and without the listing fallback (their toolkit row + an `app`-scoped
 *     re-search cover that).
 *  4. A GLOBAL query — so a connected-Gmail user asking for Google Sheets still
 *     discovers it. This ALWAYS runs; it is never short-circuited by (2).
 *  5. Catalog resolution — an app named in the query is resolved against the
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
 * result is then ONLY that app's actions (plus its toolkit-level entry) and
 * `scope` reports "resolved". A scope that resolves to nothing in the catalog
 * returns EMPTY items with scope "unresolved" — falling back to an unscoped
 * search here would pollute the multi-provider merge (another provider may
 * resolve the same scope); the sandbox proxy owns the one unscoped retry.
 */
export async function searchComposio(
  deps: SearchDeps,
  query: string,
  app?: string,
): Promise<ProviderSearchResult> {
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
  // app, to use directly — those read `connected`). Stamped by annotate(), the
  // one source of status truth, exactly like every action match.
  const pushToolkitRows = (toolkits: Toolkit[]) => {
    const represented = new Set(out.map((m) => m.toolkit.toLowerCase()));
    for (const tk of toolkits) {
      if (represented.has(tk.slug.toLowerCase())) continue;
      represented.add(tk.slug.toLowerCase());
      out.push(
        annotate(
          {
            action: "",
            toolkit: tk.slug,
            description: tk.description
              ? `${tk.name}: ${tk.description}`
              : tk.name,
          },
          slugs,
          noAuth,
          multiAccounts,
        ),
      );
    }
  };

  // Explicit scope: a HARD filter — only the named app's actions come back,
  // with the deterministic listing fallback. Unresolvable scope → EMPTY +
  // "unresolved" (the sandbox proxy retries unscoped once every provider has
  // said so).
  if (app) {
    const scoped = resolveScopeToolkits(catalog, app);
    if (scoped.length === 0) return { items: [], scope: "unresolved" };
    const results = await Promise.all(
      scoped.map((tk) => namedAppLookup(deps, query, tk.slug, true)),
    );
    for (const matches of results) for (const m of matches) push(m);
    pushToolkitRows(scoped);
    return { items: out, scope: "resolved" };
  }

  const named = resolveCatalogToolkits(catalog, query);
  const connectedTk = (tk: Toolkit) =>
    isConnectedIn(slugs, tk.slug) || noAuth.has(tk.slug.toLowerCase());
  const namedConnected = named.filter(connectedTk);
  const namedOther = named.filter((tk) => !connectedTk(tk));
  const scopedSlug = slugs.join(",");
  const [connectedResults, otherResults, scoped, global] = await Promise.all([
    // A CONNECTED app named in the query gets the listing fallback: the user
    // said the app and already has it, so a zero-scoring everyday phrasing
    // must surface its real slugs NOW, not after a model-driven re-search.
    Promise.all(
      namedConnected.map((tk) => namedAppLookup(deps, query, tk.slug, true)),
    ),
    // An UNCONNECTED query-resolved app gets the scoped query but NOT the
    // listing fallback: a loose text match must not flood the result.
    Promise.all(
      namedOther.map((tk) => namedAppLookup(deps, query, tk.slug, false)),
    ),
    slugs.length > 0
      ? deps.queryTools({ query, limit: "10", toolkit_slug: scopedSlug })
      : Promise.resolve<ToolMatch[]>([]),
    deps.queryTools({ query, limit: "10" }),
  ]);

  // A zero-hit scoped query still degrades to listing the connected toolkits'
  // actions (Composio's naive full-text scores everyday phrasings at zero), so
  // the model gets a real slug rather than a dead end — but ONLY when the
  // query named no app. A named app already got its own scoped lookup (with
  // its own listing fallback when connected) + toolkit row; dumping EVERY
  // connected app's actions on top buries the one app the user actually said
  // (the PRODUCT-1274 wall-of-Canva failure).
  const scopedListed =
    slugs.length > 0 && scoped.length === 0 && named.length === 0
      ? await deps.queryTools({ limit: "50", toolkit_slug: scopedSlug })
      : [];

  // Connected named apps first (the app the user actually said, already
  // theirs), then connected-scoped precision (or its listing fallback), then
  // unconnected named apps — a loose text match ("linear" inside "linear
  // regression") must not outrank the connected hits — then global.
  for (const matches of connectedResults) for (const m of matches) push(m);
  for (const m of scoped.length > 0 ? scoped : scopedListed) push(m);
  for (const matches of otherResults) for (const m of matches) push(m);
  for (const m of global) push(m);
  pushToolkitRows(named);
  return { items: out };
}
