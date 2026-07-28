import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { groupAccounts } from "./connected-apps-model.ts";

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
    // A catalog miss must never leak the machine slug into the product: fall
    // back to a human label built from the slug itself ("googlesheets" reads as
    // "Googlesheets", "google-sheets" as "Google Sheets"), never "googlesheets".
    name: toolkit?.name || prettifyToolkit(slug),
    description: toolkit?.description ?? "",
    logoUrl: toolkit?.logoUrl || fallbackLogo(slug),
  };
}

/**
 * A readable app name from a toolkit slug alone ("google-sheets" -> "Google
 * Sheets"), the best-effort label for every surface the catalog has not
 * resolved yet. Lives here, beside the rest of the slug -> display resolution,
 * so it is DOM-free and node-testable: `ui/chat` used to own it, which put a
 * JSX barrel in the import path of pure display code.
 */
export function prettifyToolkit(toolkit: string): string {
  return toolkit
    .trim()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve + sort a connection list into display rows by app name — ONE row per
 * toolkit for its ACTIVE connections, carrying every active account behind it
 * (a toolkit can hold several at once, e.g. two Gmail logins). Non-active
 * connections keep one row each, exactly as before, so a status-filtering
 * caller never loses a working account behind a pending primary (or vice
 * versa).
 */
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
