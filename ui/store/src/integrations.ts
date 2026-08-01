export interface IntegrationLabel {
  slug: string;
  label: string;
}
export type CatalogIntegration = IntegrationLabel;

export const INTEGRATION_CATALOG: readonly IntegrationLabel[] = [
  ["GMAIL", "Gmail"],
  ["GOOGLECALENDAR", "Google Calendar"],
  ["GOOGLESHEETS", "Google Sheets"],
  ["GOOGLEDOCS", "Google Docs"],
  ["GOOGLEDRIVE", "Google Drive"],
  ["SLACK", "Slack"],
  ["NOTION", "Notion"],
  ["GITHUB", "GitHub"],
  ["LINEAR", "Linear"],
  ["OUTLOOK", "Outlook"],
  ["TWITTER", "X"],
  ["LINKEDIN", "LinkedIn"],
  ["INSTAGRAM", "Instagram"],
  ["YOUTUBE", "YouTube"],
  ["STRIPE", "Stripe"],
  ["HUBSPOT", "HubSpot"],
  ["SALESFORCE", "Salesforce"],
  ["AIRTABLE", "Airtable"],
  ["ZOOM", "Zoom"],
  ["JIRA", "Jira"],
  ["TRELLO", "Trello"],
  ["ASANA", "Asana"],
  ["DROPBOX", "Dropbox"],
  ["DISCORD", "Discord"],
  ["GITLAB", "GitLab"],
  ["SHOPIFY", "Shopify"],
  ["MAILCHIMP", "Mailchimp"],
  ["ZENDESK", "Zendesk"],
  ["INTERCOM", "Intercom"],
  ["QUICKBOOKS", "QuickBooks"],
  ["FIGMA", "Figma"],
  ["CANVA", "Canva"],
  ["FIRECRAWL", "Firecrawl"],
  ["ATTIO", "Attio"],
  ["PIPEDRIVE", "Pipedrive"],
].map(([slug, label]) => ({ slug, label }));

const NAME_BY_SLUG = new Map(
  INTEGRATION_CATALOG.map((item) => [item.slug, item.label]),
);
const DOMAIN_BY_SLUG = new Map([
  ["GMAIL", "mail.google.com"],
  ["GOOGLECALENDAR", "calendar.google.com"],
  ["GOOGLESHEETS", "sheets.google.com"],
  ["GOOGLEDOCS", "docs.google.com"],
  ["GOOGLEDRIVE", "drive.google.com"],
  ["OUTLOOK", "outlook.com"],
  ["TWITTER", "x.com"],
  ["LINEAR", "linear.app"],
  ["QUICKBOOKS", "quickbooks.intuit.com"],
]);

export function humanizeIntegrationSlug(slug: string) {
  return slug
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function applyCatalogLabels(
  slugs: string[],
  names: Map<string, string>,
) {
  return slugs.map((slug) => ({
    slug,
    label: names.get(slug) ?? humanizeIntegrationSlug(slug),
  }));
}

export function resolveIntegrationLabels(slugs: string[]) {
  return applyCatalogLabels(slugs, NAME_BY_SLUG);
}

export function listStoreIntegrations(): CatalogIntegration[] {
  return INTEGRATION_CATALOG.map((item) => ({ ...item }));
}

export function integrationLogoUrl(slug: string) {
  const domain = DOMAIN_BY_SLUG.get(slug) ?? `${slug.toLowerCase()}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
