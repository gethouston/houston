import { resolveScopeRows } from "../scope-resolve";
import type { ToolMatch } from "../types";

/**
 * Hand-curated integrations Houston ships in its catalog even though they are
 * not in the Composio catalog (each is an MCP service the frontend's curated
 * connect dialog materializes through the custom stack). This module makes
 * them AGENT-discoverable before the user adds them: search surfaces each as a
 * connectable app row, so the model offers `request_connection` exactly as it
 * does for an unconnected Composio app. Keep slugs in lockstep with the
 * frontend catalog (app/src/components/integrations/curated-integrations.ts).
 */
export interface CuratedEntry {
  slug: string;
  name: string;
  /** English blurb for the model's search results (the agent answers the
   *  user in their own language regardless). */
  description: string;
  /** Extra match keywords beyond name/slug/description tokens — include
   *  Spanish/Portuguese terms, since users (and thus model queries) use them. */
  keywords: readonly string[];
}

export const CURATED_ENTRIES: readonly CuratedEntry[] = [
  {
    slug: "croma",
    name: "Croma",
    description:
      "Official government records from Colombia, Peru and Mexico: court cases and lawsuits, company and tax registries, vehicles and people lookups backed by official sources (Rama Judicial, RUES, SUNAT, DOF, SCJN and more).",
    keywords: [
      "legal",
      "judicial",
      "background",
      "compliance",
      "screening",
      "registry",
      "gobierno",
      "registros",
      "expediente",
      "juzgado",
      "demanda",
      "empresa",
      "empresas",
      "vehiculo",
      "antecedentes",
      "processo",
      "tribunal",
      "veiculo",
    ],
  },
];

const haystackOf = (entry: CuratedEntry): string =>
  [entry.slug, entry.name, entry.description, ...entry.keywords]
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
  return resolveScopeRows([...candidates], app).map(connectableRow);
}
