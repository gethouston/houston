// ============================================================================
// Houston Agent Store — seed (categories + Composio integrations catalog).
//
// Run with: pnpm db:seed
//
// Idempotent: onConflictDoUpdate keyed on the unique `slug`, so re-running
// reconciles rows without duplicating them.
//
// icon_url is left NULL for now — real brand/category assets land in a later
// element; seeding placeholder URLs would ship broken images.
// ============================================================================

import { categories, integrationsCatalog } from "@/db/schema";
import { closeDbConnection, db } from "@/lib/db";

// ----------------------------------------------------------------------------
// Categories — controlled vocabulary for agents.category.
// ----------------------------------------------------------------------------
const CATEGORY_SEED: { slug: string; name: string; position: number }[] = [
  { slug: "writing", name: "Writing & Content", position: 0 },
  { slug: "productivity", name: "Productivity", position: 1 },
  { slug: "research", name: "Research & Analysis", position: 2 },
  { slug: "marketing", name: "Marketing & Social", position: 3 },
  { slug: "sales", name: "Sales & CRM", position: 4 },
  { slug: "coding", name: "Coding & Dev", position: 5 },
  { slug: "design", name: "Design & Creative", position: 6 },
  { slug: "data", name: "Data & Spreadsheets", position: 7 },
  { slug: "education", name: "Education & Learning", position: 8 },
  { slug: "finance", name: "Finance & Money", position: 9 },
  { slug: "customer-support", name: "Customer Support", position: 10 },
  { slug: "personal", name: "Personal & Lifestyle", position: 11 },
  { slug: "fun", name: "Fun & Games", position: 12 },
  { slug: "other", name: "Other", position: 13 },
];

// ----------------------------------------------------------------------------
// Integrations catalog — Composio toolkit slugs (UPPERCASE, /^[A-Z0-9_]+$/).
// `category` is the chip-grouping label. Only real Composio toolkits appear
// here; Houston's built-in capabilities (web search, code, files, …) are not
// Composio integrations and are intentionally excluded.
// ----------------------------------------------------------------------------
const INTEGRATION_SEED: {
  slug: string;
  name: string;
  category: string;
  position: number;
}[] = [
  { slug: "GMAIL", name: "Gmail", category: "Email", position: 10 },
  { slug: "OUTLOOK", name: "Outlook", category: "Email", position: 11 },
  {
    slug: "GOOGLECALENDAR",
    name: "Google Calendar",
    category: "Calendar",
    position: 12,
  },
  {
    slug: "GOOGLESHEETS",
    name: "Google Sheets",
    category: "Spreadsheets",
    position: 13,
  },
  {
    slug: "GOOGLEDOCS",
    name: "Google Docs",
    category: "Documents",
    position: 14,
  },
  {
    slug: "GOOGLEDRIVE",
    name: "Google Drive",
    category: "Storage",
    position: 15,
  },
  { slug: "NOTION", name: "Notion", category: "Notes & Docs", position: 16 },
  { slug: "AIRTABLE", name: "Airtable", category: "Databases", position: 17 },
  { slug: "SLACK", name: "Slack", category: "Chat", position: 20 },
  { slug: "DISCORD", name: "Discord", category: "Chat", position: 21 },
  { slug: "ZOOM", name: "Zoom", category: "Meetings", position: 22 },
  { slug: "LINEAR", name: "Linear", category: "Project Mgmt", position: 30 },
  { slug: "JIRA", name: "Jira", category: "Project Mgmt", position: 31 },
  { slug: "ASANA", name: "Asana", category: "Project Mgmt", position: 32 },
  { slug: "TRELLO", name: "Trello", category: "Project Mgmt", position: 33 },
  { slug: "GITHUB", name: "GitHub", category: "Dev", position: 34 },
  { slug: "GITLAB", name: "GitLab", category: "Dev", position: 35 },
  { slug: "FIGMA", name: "Figma", category: "Design", position: 40 },
  { slug: "CANVA", name: "Canva", category: "Design", position: 41 },
  { slug: "TWITTER", name: "X (Twitter)", category: "Social", position: 50 },
  { slug: "LINKEDIN", name: "LinkedIn", category: "Social", position: 51 },
  { slug: "INSTAGRAM", name: "Instagram", category: "Social", position: 52 },
  { slug: "YOUTUBE", name: "YouTube", category: "Social", position: 53 },
  { slug: "MAILCHIMP", name: "Mailchimp", category: "Marketing", position: 54 },
  { slug: "HUBSPOT", name: "HubSpot", category: "CRM", position: 60 },
  { slug: "SALESFORCE", name: "Salesforce", category: "CRM", position: 61 },
  { slug: "STRIPE", name: "Stripe", category: "Payments", position: 62 },
  { slug: "SHOPIFY", name: "Shopify", category: "Commerce", position: 63 },
  { slug: "QUICKBOOKS", name: "QuickBooks", category: "Finance", position: 64 },
];

async function seed(): Promise<void> {
  console.log("→ Seeding categories...");
  for (const c of CATEGORY_SEED) {
    await db
      .insert(categories)
      .values(c)
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: c.name, position: c.position },
      });
  }
  console.log(`  inserted/updated ${CATEGORY_SEED.length} categories`);

  console.log("→ Seeding integrations catalog...");
  for (const i of INTEGRATION_SEED) {
    await db
      .insert(integrationsCatalog)
      .values({
        slug: i.slug,
        name: i.name,
        category: i.category,
        position: i.position,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: integrationsCatalog.slug,
        set: {
          name: i.name,
          category: i.category,
          position: i.position,
          isActive: true,
        },
      });
  }
  console.log(`  inserted/updated ${INTEGRATION_SEED.length} integrations`);

  console.log("✓ Seed complete");
}

seed()
  .catch((err) => {
    console.error("✗ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbConnection();
  });
