import { normalizeAppName, resolveScopeRows } from "../scope-resolve";
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
  /** Other names the service goes by, resolved as an explicit `app` scope
   *  exactly like the real name ("ghl" → HighLevel). Keywords only rank the
   *  unscoped search; a scope naming an alias would otherwise miss. */
  aliases?: readonly string[];
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
  {
    slug: "highlevel",
    name: "HighLevel",
    description:
      "HighLevel (GoHighLevel, GHL) CRM and marketing platform: contacts and leads, conversations and messages (SMS, email), opportunities and pipelines, calendars and appointments, invoices and payments, social posts and blog posts. One sub-account per connection.",
    keywords: [
      "crm",
      "leads",
      "contacts",
      "pipeline",
      "pipelines",
      "opportunities",
      "deals",
      "appointments",
      "calendar",
      "invoices",
      "payments",
      "sms",
      "marketing",
      "agency",
      "funnel",
      "clientes",
      "contactos",
      "embudo",
      "oportunidades",
      "citas",
      "facturas",
      "contatos",
      "funil",
      "agendamentos",
      "faturas",
    ],
    aliases: ["gohighlevel", "go high level", "ghl", "leadconnector"],
  },
];

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
