import { normalizeAppName, resolveScopeRows } from "../scope-resolve";
import type { ToolMatch } from "../types";
import { CURATED_ENTRIES, type CuratedEntry } from "./curated-entries";

export { CURATED_ENTRIES, type CuratedEntry } from "./curated-entries";

/**
 * Hand-curated integrations Houston ships in its catalog even though they are
 * not in the Composio catalog (each an MCP server or a committed OpenAPI
 * document the frontend's curated connect dialog materializes through the
 * custom stack). This module makes them AGENT-discoverable before the user
 * adds them: search surfaces each as a connectable app row, so the model
 * offers `request_connection` exactly as it does for an unconnected Composio
 * app. The entries themselves live in `curated-entries.ts`.
 */

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

/** The connectable app row a curated entry contributes to search results —
 *  the same shape an unconnected Composio app wears, so the model performs
 *  the same speech act (offer `request_connection`). */
function connectableRow(entry: CuratedEntry): ToolMatch {
  return {
    action: "",
    toolkit: entry.slug,
    description: entry.description,
    connected: false,
    status: "connectable",
  };
}

/**
 * Curated entries matching an already-tokenized query, excluding any the user
 * has ADDED (their compiled tools/app row speak for themselves then). Same
 * substring-per-token matching the custom tool scorer uses.
 */
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

/**
 * The curated slug an explicit `app` scope names by alias ("ghl",
 * "LeadConnector"), else the scope unchanged. Runs BEFORE the installed
 * definitions are scoped so an alias keeps resolving after the user adds the
 * app — the compiled definition only knows its real name, and "unresolved"
 * there would send the model on an unscoped retry that buries the one app it
 * asked about. Exact normalized match only: aliases are short, and substring
 * rules belong to `resolveScopeRows`.
 */
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

/**
 * Resolve an explicit `app` scope against the curated (not-yet-added) entries,
 * with the SAME provider-neutral rules every scope resolution uses — so a
 * scoped search for a curated app answers its connectable row instead of
 * "unresolved" (which would let the unscoped retry bury it in noise).
 */
export function curatedScoped(
  app: string,
  added: ReadonlySet<string>,
  entries: readonly CuratedEntry[] = CURATED_ENTRIES,
): ToolMatch[] {
  const candidates = entries.filter((entry) => !added.has(entry.slug));
  // One row per name the entry answers to; the hits collapse back onto the
  // entry so an alias and the real name never yield two rows for one app.
  const rows = candidates.flatMap((entry) =>
    [entry.name, ...(entry.aliases ?? [])].map((name) => ({
      slug: entry.slug,
      name,
    })),
  );
  const hit = new Set(resolveScopeRows(rows, app).map((row) => row.slug));
  return candidates.filter((entry) => hit.has(entry.slug)).map(connectableRow);
}
