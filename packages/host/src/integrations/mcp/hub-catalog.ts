import type { Toolkit } from "../types";

/**
 * The browsable app catalog a Composio hub offers. The hub's MCP surface can
 * manage and execute any of Composio's 500+ toolkits but exposes no
 * browse-the-catalog call, so the Integrations page shows this curated set of
 * the most-connected apps (anything else still works: the agent reaches the
 * full set through search, and connecting an uncurated app from chat surfaces
 * it here as a connected card). Logos ride Composio's public logo service.
 */
const logo = (slug: string) => `https://logos.composio.dev/api/${slug}`;

const APP = (
  slug: string,
  name: string,
  description: string,
  categories: string[],
): Toolkit => ({ slug, name, description, logoUrl: logo(slug), categories });

export const HUB_APP_CATALOG: Toolkit[] = [
  APP("gmail", "Gmail", "Send and manage email", ["productivity"]),
  APP("googlecalendar", "Google Calendar", "Events and scheduling", [
    "productivity",
  ]),
  APP("googledrive", "Google Drive", "Files in the cloud", ["productivity"]),
  APP("googledocs", "Google Docs", "Documents", ["productivity"]),
  APP("googlesheets", "Google Sheets", "Spreadsheets", ["productivity"]),
  APP("slack", "Slack", "Team messaging", ["communication"]),
  APP("discord", "Discord", "Community chat", ["communication"]),
  APP("microsoft_teams", "Microsoft Teams", "Team chat and meetings", [
    "communication",
  ]),
  APP("outlook", "Outlook", "Email and calendar", ["productivity"]),
  APP("notion", "Notion", "Docs, wikis, and databases", ["productivity"]),
  APP("linear", "Linear", "Issue tracking", ["developer-tools"]),
  APP("jira", "Jira", "Project and issue tracking", ["developer-tools"]),
  APP("github", "GitHub", "Code and pull requests", ["developer-tools"]),
  APP("gitlab", "GitLab", "Code and CI", ["developer-tools"]),
  APP("trello", "Trello", "Kanban boards", ["productivity"]),
  APP("asana", "Asana", "Work management", ["productivity"]),
  APP("clickup", "ClickUp", "Tasks and docs", ["productivity"]),
  APP("monday", "Monday.com", "Work OS", ["productivity"]),
  APP("airtable", "Airtable", "Databases and views", ["productivity"]),
  APP("hubspot", "HubSpot", "CRM and marketing", ["crm"]),
  APP("salesforce", "Salesforce", "CRM", ["crm"]),
  APP("pipedrive", "Pipedrive", "Sales CRM", ["crm"]),
  APP("zendesk", "Zendesk", "Customer support", ["support"]),
  APP("intercom", "Intercom", "Customer messaging", ["support"]),
  APP("stripe", "Stripe", "Payments", ["finance"]),
  APP("shopify", "Shopify", "E-commerce", ["commerce"]),
  APP("quickbooks", "QuickBooks", "Accounting", ["finance"]),
  APP("xero", "Xero", "Accounting", ["finance"]),
  APP("dropbox", "Dropbox", "File storage", ["productivity"]),
  APP("onedrive", "OneDrive", "Microsoft file storage", ["productivity"]),
  APP("zoom", "Zoom", "Video meetings", ["communication"]),
  APP("calendly", "Calendly", "Scheduling links", ["productivity"]),
  APP("typeform", "Typeform", "Forms and surveys", ["marketing"]),
  APP("mailchimp", "Mailchimp", "Email marketing", ["marketing"]),
  APP("twitter", "X (Twitter)", "Posts and engagement", ["social"]),
  APP("linkedin", "LinkedIn", "Professional network", ["social"]),
  APP("reddit", "Reddit", "Communities", ["social"]),
  APP("youtube", "YouTube", "Video", ["social"]),
  APP("figma", "Figma", "Design files", ["design"]),
  APP("supabase", "Supabase", "Postgres and auth", ["developer-tools"]),
];
