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

export interface SearchDeps {
  listConnections(): Promise<Connection[]>;
  queryTools(query: Record<string, string>): Promise<ToolMatch[]>;
  catalog(): Promise<Toolkit[]>;
}

export function actionSlugOf(
  query: string,
  toolkitSlug: string,
): string | null {
  const slug = query.trim().toUpperCase();
  const prefixes = ["", "_"].map(
    (separator) =>
      `${toolkitSlug.toUpperCase().replace(/[^A-Z0-9]/g, separator)}_`,
  );
  return /^[A-Z0-9_]+$/.test(slug) &&
    prefixes.some(
      (prefix) => slug.startsWith(prefix) && slug.length > prefix.length,
    )
    ? slug
    : null;
}

async function namedAppLookup(
  deps: SearchDeps,
  query: string,
  slug: string,
  list: boolean,
): Promise<ToolMatch[]> {
  const actionSlug = actionSlugOf(query, slug);
  const [hits, scoped] = await Promise.all([
    actionSlug
      ? deps
          .queryTools({ tool_slugs: actionSlug, toolkit_slug: slug })
          .catch((err: unknown) => {
            console.warn(
              `[composio] exact action lookup failed for ${actionSlug}; using full-text results`,
              err,
            );
            return [];
          })
      : Promise.resolve<ToolMatch[]>([]),
    deps.queryTools({ query, limit: "10", toolkit_slug: slug }),
  ]);
  const direct = hits.filter(
    (m) => m.toolkit.toLowerCase() === slug.toLowerCase(),
  );
  if (direct.length > 0 || scoped.length > 0 || !list)
    return [...direct, ...scoped];
  return deps.queryTools({ limit: "50", toolkit_slug: slug });
}

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
    Promise.all(
      namedConnected.map((tk) => namedAppLookup(deps, query, tk.slug, true)),
    ),
    Promise.all(
      namedOther.map((tk) => namedAppLookup(deps, query, tk.slug, false)),
    ),
    slugs.length > 0
      ? deps.queryTools({ query, limit: "10", toolkit_slug: scopedSlug })
      : Promise.resolve<ToolMatch[]>([]),
    deps.queryTools({ query, limit: "10" }),
  ]);

  const scopedListed =
    slugs.length > 0 && scoped.length === 0 && named.length === 0
      ? await deps.queryTools({ limit: "50", toolkit_slug: scopedSlug })
      : [];

  for (const matches of connectedResults) for (const m of matches) push(m);
  for (const m of scoped.length > 0 ? scoped : scopedListed) push(m);
  for (const matches of otherResults) for (const m of matches) push(m);
  for (const m of global) push(m);
  pushToolkitRows(named);
  return { items: out };
}
