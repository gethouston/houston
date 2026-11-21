import { normalizeAppName, resolveScopeRows } from "./scope-resolve";
import type { Toolkit } from "./types";

export { normalizeAppName } from "./scope-resolve";

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

export function resolveScopeToolkits(
  catalog: Toolkit[],
  app: string,
): Toolkit[] {
  return resolveScopeRows(catalog, app);
}
