/**
 * Integration display-name resolution for the store UI.
 *
 * IR integrations are Composio toolkit slugs: uppercase, single concatenated
 * tokens ("GITHUB", "GOOGLECALENDAR", "YOUTUBE"). Title-casing a slug in isolation
 * renders wrong brand casing, so we keep a curated catalog of the common toolkits
 * with their correct human names and fall back to a humanized slug for anything
 * not listed.
 *
 * Pure and dependency-light (no DB, no Next): the gateway serves categories but
 * not an integrations catalog, so this static list is the store's source of brand
 * labels for both the agent page chips and the /explore "Works with" filter.
 */

/** A resolved integration ready to render: the raw slug plus its display label. */
export interface IntegrationLabel {
  slug: string;
  label: string;
}

/** An integration for the explore filter row (alias of `IntegrationLabel`). */
export type CatalogIntegration = IntegrationLabel;

/**
 * Curated Composio toolkits shown as filter chips, in display order. Mirrors the
 * brands agents most commonly target; the `slug` is the exact IR integration
 * token. Not exhaustive — uncatalogued slugs still resolve via `humanize`.
 */
const INTEGRATION_CATALOG: { slug: string; label: string }[] = [
  { slug: "GMAIL", label: "Gmail" },
  { slug: "OUTLOOK", label: "Outlook" },
  { slug: "GOOGLECALENDAR", label: "Google Calendar" },
  { slug: "GOOGLESHEETS", label: "Google Sheets" },
  { slug: "GOOGLEDOCS", label: "Google Docs" },
  { slug: "GOOGLEDRIVE", label: "Google Drive" },
  { slug: "NOTION", label: "Notion" },
  { slug: "AIRTABLE", label: "Airtable" },
  { slug: "SLACK", label: "Slack" },
  { slug: "DISCORD", label: "Discord" },
  { slug: "ZOOM", label: "Zoom" },
  { slug: "LINEAR", label: "Linear" },
  { slug: "JIRA", label: "Jira" },
  { slug: "ASANA", label: "Asana" },
  { slug: "TRELLO", label: "Trello" },
  { slug: "GITHUB", label: "GitHub" },
  { slug: "GITLAB", label: "GitLab" },
  { slug: "FIGMA", label: "Figma" },
  { slug: "CANVA", label: "Canva" },
  { slug: "TWITTER", label: "X (Twitter)" },
  { slug: "LINKEDIN", label: "LinkedIn" },
  { slug: "INSTAGRAM", label: "Instagram" },
  { slug: "YOUTUBE", label: "YouTube" },
  { slug: "MAILCHIMP", label: "Mailchimp" },
  { slug: "HUBSPOT", label: "HubSpot" },
  { slug: "SALESFORCE", label: "Salesforce" },
  { slug: "STRIPE", label: "Stripe" },
  { slug: "SHOPIFY", label: "Shopify" },
  { slug: "QUICKBOOKS", label: "QuickBooks" },
];

/** slug -> curated display name, for O(1) label lookup. */
const NAME_BY_SLUG = new Map(INTEGRATION_CATALOG.map((i) => [i.slug, i.label]));

/**
 * Best-effort display name for a slug with no catalog entry. Composio slugs are
 * single concatenated tokens, so this only lower/title-cases the whole token
 * (e.g. "MAKE" -> "Make"); multi-word brands rely on the catalog for correct
 * casing and spacing.
 */
export function humanizeIntegrationSlug(slug: string): string {
  return slug
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Map catalog names onto slugs in input order, humanizing uncataloged slugs. */
export function applyCatalogLabels(
  slugs: string[],
  nameBySlug: Map<string, string>,
): IntegrationLabel[] {
  return slugs.map((slug) => ({
    slug,
    label: nameBySlug.get(slug) ?? humanizeIntegrationSlug(slug),
  }));
}

/** Resolve IR integration slugs to display labels via the curated catalog. */
export function resolveIntegrationLabels(slugs: string[]): IntegrationLabel[] {
  return applyCatalogLabels(slugs, NAME_BY_SLUG);
}

/** The curated integrations shown as /explore filter chips, in display order. */
export function listStoreIntegrations(): CatalogIntegration[] {
  return INTEGRATION_CATALOG.map((i) => ({ slug: i.slug, label: i.label }));
}
