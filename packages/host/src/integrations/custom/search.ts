import type { ToolMatch } from "../types";

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
}

const MAX_MATCHES = 20;

const tokenize = (q: string): string[] =>
  q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

/**
 * Score custom tools against a plain-language query: token hits on the tool
 * name/description weigh 1, hits on the integration's slug/name weigh 2 (the
 * user usually names the app: "acme create ticket"). Zero-hit tools drop out.
 */
export function searchCustomTools(
  query: string,
  tools: CustomToolRow[],
  defs: CustomDefRow[],
): ToolMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const nameOf = new Map(defs.map((d) => [d.slug, d.name.toLowerCase()]));

  const scored = tools
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
    .slice(0, MAX_MATCHES);

  const matches = scored.map(({ tool }) => toMatch(tool, nameOf));

  // Toolkit-level entries for queried apps with no scored tool (mirrors the
  // Composio catalog-resolution step): the model still learns the slug.
  const seen = new Set(matches.map((m) => m.toolkit));
  for (const def of defs) {
    if (seen.has(def.slug)) continue;
    const appText = `${def.slug} ${def.name}`.toLowerCase();
    if (tokens.some((t) => appText.includes(t))) {
      matches.push({
        action: "",
        toolkit: def.slug,
        description: `${def.name} (custom integration)`,
        connected: true,
        status: "connected",
      });
    }
  }
  return matches;
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
