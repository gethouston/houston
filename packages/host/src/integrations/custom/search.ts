import type { ProviderSearchResult } from "../provider";
import { exactScopeRows, resolveScopeRows } from "../scope-resolve";
import type { ToolMatch } from "../types";
import {
  curatedCanonicalScope,
  curatedMatches,
  curatedScoped,
} from "./curated";

/** The subset of an executor tool row that scoring needs. */
export interface CustomToolRow {
  address: string;
  integration: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface CustomDefRow {
  slug: string;
  name: string;
  /** Compiled and connected. A pending/errored def still surfaces (the model
   *  learns the slug) but as NOT CONNECTED, so the model offers the connect
   *  hand-off instead of trying to run tools that do not exist. */
  active: boolean;
}

const MAX_MATCHES = 20;

const tokenize = (q: string): string[] =>
  q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

/** An integration surfaced at app level (no action): the model still learns
 *  the slug. One shape for the scoped and unscoped paths. */
const appRow = (d: CustomDefRow): ToolMatch => ({
  action: "",
  toolkit: d.slug,
  description: `${d.name} (custom integration)`,
  connected: d.active,
  status: d.active ? "connected" : "connectable",
});

/** Score tools against a plain-language query: token hits on the tool
 *  name/description weigh 1, hits on the integration's slug/name weigh 2 (the
 *  user usually names the app: "acme create ticket"). Zero-hit tools drop. */
function scoreTools(
  query: string,
  tools: CustomToolRow[],
  nameOf: Map<string, string | undefined>,
): ToolMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return tools
    .map((tool) => {
      const toolText = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
      const appText = `${tool.integration} ${nameOf.get(tool.integration) ?? ""}`;
      let score = 0;
      for (const token of tokens) {
        if (appText.includes(token)) score += 2;
        if (toolText.includes(token)) score += 1;
      }
      return { tool, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map(({ tool }) => toMatch(tool, nameOf));
}

/**
 * Search custom tools. `app` (optional) is the agent's HARD scope
 * (PRODUCT-1274), resolved via the shared provider-neutral rules
 * (scope-resolve.ts): only the resolved integration is searched, and a
 * zero-score scoped search degrades to LISTING its tools (the deterministic
 * fallback — a named app must surface its actions, not an empty result, when
 * the phrasing scores zero). An unresolvable scope returns EMPTY items with
 * scope "unresolved"; the sandbox proxy owns the one unscoped retry.
 */
export function searchCustomTools(
  query: string,
  tools: CustomToolRow[],
  defs: CustomDefRow[],
  app?: string,
): ProviderSearchResult {
  const added = new Set(defs.map((d) => d.slug));
  if (app) {
    // Precedence: an installed definition the scope names EXACTLY, then a
    // curated alias ("ghl", "leadconnector") naming the curated slug whether
    // or not it is added yet, then the loose substring rules — so a user's
    // own integration literally named like an alias keeps its scope, while
    // an alias never falls through to a substring neighbour ("lead",
    // "Level"): once it names the curated slug, only that slug can answer.
    const scope =
      exactScopeRows(defs, app).length > 0 ? app : curatedCanonicalScope(app);
    const scopedDefs =
      scope === app
        ? resolveScopeRows(defs, scope)
        : exactScopeRows(defs, scope);
    if (scopedDefs.length === 0) {
      // A scope naming a curated, not-yet-added app resolves to its
      // connectable row — "unresolved" would trigger the unscoped retry and
      // bury the one app the model asked about under other apps' matches.
      const curated = curatedScoped(scope, added);
      if (curated.length > 0) return { items: curated, scope: "resolved" };
      return { items: [], scope: "unresolved" };
    }
    const slugs = new Set(scopedDefs.map((d) => d.slug));
    const scopedTools = tools.filter((t) => slugs.has(t.integration));
    const nameOf = new Map(
      scopedDefs.map((d) => [d.slug, d.name.toLowerCase()]),
    );
    const scored = scoreTools(query, scopedTools, nameOf);
    if (scored.length > 0) return { items: scored, scope: "resolved" };
    const listed = scopedTools
      .slice(0, MAX_MATCHES)
      .map((t) => toMatch(t, nameOf));
    // An integration with no compiled tool still surfaces as an app row —
    // a resolved scope always yields at least one row.
    return {
      items: listed.length > 0 ? listed : scopedDefs.map(appRow),
      scope: "resolved",
    };
  }
  const nameOf = new Map(defs.map((d) => [d.slug, d.name.toLowerCase()]));
  const matches = scoreTools(query, tools, nameOf);

  // Toolkit-level entries for queried apps with no scored tool (mirrors the
  // Composio catalog-resolution step): the model still learns the slug.
  const tokens = tokenize(query);
  const seen = new Set(matches.map((m) => m.toolkit));
  for (const def of defs) {
    if (seen.has(def.slug)) continue;
    const appText = `${def.slug} ${def.name}`.toLowerCase();
    if (tokens.some((t) => appText.includes(t))) {
      matches.push(appRow(def));
    }
  }
  // Curated, not-yet-added entries surface as CONNECTABLE app rows, so the
  // model offers request_connection for them like any unconnected app.
  matches.push(...curatedMatches(tokens, added));
  return { items: matches };
}

function toMatch(
  tool: CustomToolRow,
  nameOf: Map<string, string | undefined>,
): ToolMatch {
  const app = nameOf.get(tool.integration);
  const prefix = app ? `[${app}] ` : "";
  return {
    action: tool.address,
    toolkit: tool.integration,
    description: `${prefix}${tool.description ?? tool.name}`,
    ...(tool.inputSchema !== undefined
      ? { inputParams: tool.inputSchema }
      : {}),
    connected: true,
    status: "connected",
  };
}
