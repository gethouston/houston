/**
 * Display names for the Composio toolkit slugs instruction generation
 * suggests. Covers the slugs the generation prompt names; anything unknown
 * falls back to a title-cased slug (mirrors the Rust engine's
 * `toolkit_display_name` behavior).
 */
const TOOLKIT_NAMES: Record<string, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googlesheets: "Google Sheets",
  googledocs: "Google Docs",
  googledrive: "Google Drive",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  jira: "Jira",
  trello: "Trello",
  asana: "Asana",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  shopify: "Shopify",
  stripe: "Stripe",
  twitter: "Twitter",
  linkedin: "LinkedIn",
  discord: "Discord",
  airtable: "Airtable",
  excel: "Excel",
  outlook: "Outlook",
  linear: "Linear",
  gitlab: "GitLab",
  dropbox: "Dropbox",
  figma: "Figma",
  telegram: "Telegram",
  onedrive: "OneDrive",
};

export function toolkitDisplayName(slug: string): string {
  const known = TOOLKIT_NAMES[slug.toLowerCase()];
  if (known) return known;
  const lower = slug.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
