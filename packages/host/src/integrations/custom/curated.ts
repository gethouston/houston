import { normalizeAppName, resolveScopeRows } from "../scope-resolve";
import type { ToolMatch } from "../types";
import { CURATED_ENTRIES, type CuratedEntry } from "./curated-entries";

export { CURATED_ENTRIES, type CuratedEntry } from "./curated-entries";

const haystackOf = (entry: CuratedEntry): string =>
  [
    entry.slug,
    entry.name,
    entry.description,
    ...entry.keywords,
    ...(entry.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase();

function connectableRow(entry: CuratedEntry): ToolMatch {
  return {
    action: "",
    toolkit: entry.slug,
    description: entry.description,
    connected: false,
    status: "connectable",
  };
}

export function curatedMatches(
  tokens: readonly string[],
  added: ReadonlySet<string>,
  entries: readonly CuratedEntry[] = CURATED_ENTRIES,
): ToolMatch[] {
  if (tokens.length === 0) return [];
  return entries
    .filter((entry) => !added.has(entry.slug))
    .filter((entry) => {
      const haystack = haystackOf(entry);
      return tokens.some((token) => haystack.includes(token));
    })
    .map(connectableRow);
}

export function curatedCanonicalScope(
  app: string,
  entries: readonly CuratedEntry[] = CURATED_ENTRIES,
): string {
  const scope = normalizeAppName(app);
  if (!scope) return app;
  const hit = entries.find((entry) =>
    (entry.aliases ?? []).some((alias) => normalizeAppName(alias) === scope),
  );
  return hit ? hit.slug : app;
}

export function curatedScoped(
  app: string,
  added: ReadonlySet<string>,
  entries: readonly CuratedEntry[] = CURATED_ENTRIES,
): ToolMatch[] {
  const candidates = entries.filter((entry) => !added.has(entry.slug));
  const rows = candidates.flatMap((entry) =>
    [entry.name, ...(entry.aliases ?? [])].map((name) => ({
      slug: entry.slug,
      name,
    })),
  );
  const hit = new Set(resolveScopeRows(rows, app).map((row) => row.slug));
  return candidates.filter((entry) => hit.has(entry.slug)).map(connectableRow);
}
