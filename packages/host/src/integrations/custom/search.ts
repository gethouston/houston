import type { ProviderSearchResult } from "../provider";
import { exactScopeRows, resolveScopeRows } from "../scope-resolve";
import type { ToolMatch } from "../types";
import {
  curatedCanonicalScope,
  curatedMatches,
  curatedScoped,
} from "./curated";

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
  active: boolean;
}

const MAX_MATCHES = 20;

const tokenize = (q: string): string[] =>
  q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

const appRow = (d: CustomDefRow): ToolMatch => ({
  action: "",
  toolkit: d.slug,
  description: `${d.name} (custom integration)`,
  connected: d.active,
  status: d.active ? "connected" : "connectable",
});

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

export function searchCustomTools(
  query: string,
  tools: CustomToolRow[],
  defs: CustomDefRow[],
  app?: string,
): ProviderSearchResult {
  const added = new Set(defs.map((d) => d.slug));
  if (app) {
    const scope =
      exactScopeRows(defs, app).length > 0 ? app : curatedCanonicalScope(app);
    const scopedDefs =
      scope === app
        ? resolveScopeRows(defs, scope)
        : exactScopeRows(defs, scope);
    if (scopedDefs.length === 0) {
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
    return {
      items: listed.length > 0 ? listed : scopedDefs.map(appRow),
      scope: "resolved",
    };
  }
  const nameOf = new Map(defs.map((d) => [d.slug, d.name.toLowerCase()]));
  const matches = scoreTools(query, tools, nameOf);

  const tokens = tokenize(query);
  const seen = new Set(matches.map((m) => m.toolkit));
  for (const def of defs) {
    if (seen.has(def.slug)) continue;
    const appText = `${def.slug} ${def.name}`.toLowerCase();
    if (tokens.some((t) => appText.includes(t))) {
      matches.push(appRow(def));
    }
  }
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
