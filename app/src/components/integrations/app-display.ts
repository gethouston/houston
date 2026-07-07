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

/** One display row per connected account. `connectionId` is exposed at the top
 * level (not only inside `connection`) so callers keying per account never have
 * to reach through the nested object. */
export interface ConnectionRow {
  connectionId: string;
  connection: IntegrationConnection;
  app: AppDisplay;
}

/** Resolve + sort a connection list into display rows by app name. */
export function connectionRows(
  connections: IntegrationConnection[],
  catalog: IntegrationToolkit[],
): ConnectionRow[] {
  const bySlug = new Map(catalog.map((tk) => [tk.slug, tk]));
  return connections
    .map((c) => ({
      connectionId: c.connectionId,
      connection: c,
      app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
    }))
    .sort((a, b) => a.app.name.localeCompare(b.app.name));
}

export function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}
