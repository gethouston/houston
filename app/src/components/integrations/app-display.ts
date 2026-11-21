import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { groupAccounts } from "./connected-apps-model.ts";
import { curatedIntegrationOf } from "./curated-integrations.ts";

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
    name: toolkit?.name || prettifyToolkit(slug),
    description: toolkit?.description ?? "",
    logoUrl: toolkit?.logoUrl || fallbackLogo(slug),
  };
}

export function prettifyToolkit(toolkit: string): string {
  return toolkit
    .trim()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function connectionRows(
  connections: IntegrationConnection[],
  catalog: IntegrationToolkit[],
): {
  connection: IntegrationConnection;
  accounts: IntegrationConnection[];
  app: AppDisplay;
}[] {
  const bySlug = new Map(catalog.map((tk) => [tk.slug, tk]));
  const rowOf = (
    connection: IntegrationConnection,
    accounts: IntegrationConnection[],
  ) => ({
    connection,
    accounts,
    app: appDisplay(connection.toolkit, bySlug.get(connection.toolkit)),
  });
  const grouped = groupAccounts(
    connections.filter((c) => c.status === "active"),
  ).map(({ connection, accounts }) => rowOf(connection, accounts));
  const singles = connections
    .filter((c) => c.status !== "active")
    .map((c) => rowOf(c, [c]));
  return [...grouped, ...singles].sort((a, b) =>
    a.app.name.localeCompare(b.app.name),
  );
}

export function fallbackLogo(toolkit: string): string {
  const curated = curatedIntegrationOf(toolkit);
  const domain = curated ? new URL(curated.website).hostname : `${toolkit}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

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

export interface CustomActionRef {
  slug: string;
  tool: string;
}

export function customActionOf(action: string): CustomActionRef | null {
  if (!action.startsWith("tools.")) return null;
  const segments = action.split(".");
  if (segments.length < 5) return null;
  const slug = segments[1];
  const tool = segments[segments.length - 1];
  return slug && tool ? { slug, tool } : null;
}

export function camelToSnakeCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function prettifyCustomSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
