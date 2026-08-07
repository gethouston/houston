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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Resolve an app scope against the defs: an EXACT normalized slug/name match
 * wins outright ("Acme" must never also pull in "Acme Staging"); only when no
 * def matches exactly does loose both-way substring containment apply
 * ("PostHog" hits name "PostHog EU").
 */
function scopedDefsFor(defs: CustomDefRow[], scope: string): CustomDefRow[] {
  const want = norm(scope);
  if (want.length < 3) return [];
  const exact = defs.filter(
    (d) => norm(d.slug) === want || norm(d.name) === want,
  );
  if (exact.length > 0) return exact;
  return defs.filter((d) =>
    [norm(d.slug), norm(d.name)].some(
      (s) => s.length >= 3 && (s.includes(want) || want.includes(s)),
    ),
  );
}

/**
 * Score custom tools against a plain-language query: token hits on the tool
 * name/description weigh 1, hits on the integration's slug/name weigh 2 (the
 * user usually names the app: "acme create ticket"). Zero-hit tools drop out.
 *
 * `app` (optional) is the agent's HARD scope (PRODUCT-1274): only integrations
 * matching it are searched, and a zero-score scoped search degrades to LISTING
 * the scoped integration's tools (the deterministic fallback — a named app must
 * surface its actions, not an empty result, when the phrasing scores zero).
 */
export function searchCustomTools(
  query: string,
  tools: CustomToolRow[],
  defs: CustomDefRow[],
  app?: string,
): ToolMatch[] {
  if (app) {
    const scopedDefs = scopedDefsFor(defs, app);
    if (scopedDefs.length === 0) return [];
    const slugs = new Set(scopedDefs.map((d) => d.slug));
    const scopedTools = tools.filter((t) => slugs.has(t.integration));
    const scored = searchCustomTools(query, scopedTools, scopedDefs);
    if (scored.some((m) => m.action !== "")) return scored;
    const nameOf = new Map(
      scopedDefs.map((d) => [d.slug, d.name.toLowerCase()]),
    );
    const listed = scopedTools
      .slice(0, MAX_MATCHES)
      .map((t) => toMatch(t, nameOf));
    if (listed.length > 0) return listed;
    // An integration with no compiled tool still surfaces as an app row.
    return scopedDefs.map((d) => ({
      action: "",
      toolkit: d.slug,
      description: `${d.name} (custom integration)`,
      connected: true,
      status: "connected" as const,
    }));
  }
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
