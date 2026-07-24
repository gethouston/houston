import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";

/**
 * Resolving a toolkit slug to a real display name / logo / description (with
 * slug fallbacks when the catalog is missing it). Kept DOM-free so both the
 * surfaces and the row components share one source of truth. Real app names and
 * logos, never machine slugs.
 */

/** Display info resolved from the catalog (slug fallbacks when absent). */
export interface AppDisplay {
  toolkit: string;
  name: string;
  description: string;
  logoUrl: string;
}

export function appDisplay(
  slug: string,
  toolkit: IntegrationToolkit | undefined,
): AppDisplay {
  return {
    toolkit: slug,
    name: toolkit?.name ?? slug,
    description: toolkit?.description ?? "",
    logoUrl: toolkit?.logoUrl || fallbackLogo(slug),
  };
}

/** Resolve + sort a connection list into display rows by app name. */
export function connectionRows(
  connections: IntegrationConnection[],
  catalog: IntegrationToolkit[],
): { connection: IntegrationConnection; app: AppDisplay }[] {
  const bySlug = new Map(catalog.map((tk) => [tk.slug, tk]));
  return connections
    .map((c) => ({
      connection: c,
      app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
    }))
    .sort((a, b) => a.app.name.localeCompare(b.app.name));
}

export function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}

/**
 * Best-effort toolkit slug for a bare Composio action slug. Tools carry only the
 * ACTION (e.g. `GMAIL_SEND_EMAIL`, `GOOGLE_MAPS_SEARCH`), so a display surface
 * must re-derive which app it belongs to. We pick the LONGEST catalog slug the
 * action starts with, so a multi-word slug (`google_maps`) wins over its first
 * segment (`google`) — mirroring the host's execute-time `resolveToolkit`. Falls
 * back to the segment before the first underscore when the catalog has no match
 * (or has not loaded yet). Pure + node-tested; the visible label is HUMANIZED
 * from this result, never the raw slug.
 */
export function toolkitOfActionSlug(
  action: string,
  catalogSlugs: string[],
): string {
  const a = action.toLowerCase();
  let best: string | null = null;
  for (const slug of catalogSlugs) {
    const s = slug.toLowerCase();
    if ((a === s || a.startsWith(`${s}_`)) && (!best || s.length > best.length))
      best = s;
  }
  return best ?? a.split("_")[0] ?? "";
}
