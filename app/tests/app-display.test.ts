import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  appDisplay,
  fallbackLogo,
  prettifyToolkit,
  toolkitOfActionSlug,
} from "../src/components/integrations/app-display.ts";

const tk = (
  slug: string,
  name: string,
  logoUrl?: string,
): IntegrationToolkit => ({
  slug,
  name,
  categories: [],
  description: `${name} desc`,
  logoUrl,
});

describe("appDisplay logo resolution", () => {
  it("prefers the catalog logoUrl when present", () => {
    const app = appDisplay(
      "googledocs",
      tk("googledocs", "Google Docs", "https://cdn.example/googledocs.svg"),
    );
    strictEqual(app.logoUrl, "https://cdn.example/googledocs.svg");
    strictEqual(app.name, "Google Docs");
  });

  it("falls back to the favicon guess when the catalog entry has no logo", () => {
    const app = appDisplay("slack", tk("slack", "Slack"));
    strictEqual(app.logoUrl, fallbackLogo("slack"));
  });

  it("falls back to the favicon guess when the catalog entry has an empty logoUrl", () => {
    const app = appDisplay("slack", tk("slack", "Slack", ""));
    strictEqual(app.logoUrl, fallbackLogo("slack"));
  });

  it("falls back to a HUMAN name + favicon guess when the toolkit is absent", () => {
    const app = appDisplay("quickbooks", undefined);
    // Never the raw machine slug: a catalog miss must still read as a product.
    strictEqual(app.name, "Quickbooks");
    strictEqual(app.logoUrl, fallbackLogo("quickbooks"));
  });

  it("prettifies a multi-word slug on a catalog miss", () => {
    strictEqual(appDisplay("google-sheets", undefined).name, "Google Sheets");
    strictEqual(appDisplay("googlesheets", undefined).name, "Googlesheets");
  });

  it("an empty catalog name is treated as a miss, not as a blank label", () => {
    const app = appDisplay("notion", { ...tk("notion", ""), name: "" });
    strictEqual(app.name, "Notion");
  });
});

describe("prettifyToolkit", () => {
  it("title-cases every word across the slug separators", () => {
    strictEqual(prettifyToolkit("google_sheets"), "Google Sheets");
    strictEqual(prettifyToolkit("google-sheets"), "Google Sheets");
    strictEqual(prettifyToolkit("  slack  "), "Slack");
  });

  it("collapses repeated separators instead of emitting blanks", () => {
    strictEqual(prettifyToolkit("google--sheets"), "Google Sheets");
    strictEqual(prettifyToolkit(""), "");
  });
});

// An action slug carries no toolkit, so the header re-derives it: the longest
// catalog slug the action starts with, so a multi-word app wins over its first
// segment; a first-segment fallback when the catalog can't place it.
describe("toolkitOfActionSlug", () => {
  const catalog = [
    "gmail",
    "google",
    "google_maps",
    "active_campaign",
    "slack",
  ];

  it("picks the LONGEST prefixing slug over its first segment", () => {
    strictEqual(
      toolkitOfActionSlug("GOOGLE_MAPS_SEARCH_PLACES", catalog),
      "google_maps",
    );
    strictEqual(
      toolkitOfActionSlug("ACTIVE_CAMPAIGN_ADD_CONTACT", catalog),
      "active_campaign",
    );
  });

  it("matches a single-word toolkit", () => {
    strictEqual(toolkitOfActionSlug("GMAIL_SEND_EMAIL", catalog), "gmail");
  });

  it("matches an exact-slug action with no verb suffix", () => {
    strictEqual(toolkitOfActionSlug("SLACK", catalog), "slack");
  });

  it("falls back to the first underscore segment when the catalog has no match", () => {
    strictEqual(toolkitOfActionSlug("NOTION_CREATE_PAGE", catalog), "notion");
    strictEqual(toolkitOfActionSlug("STRIPE_REFUND", []), "stripe");
  });
});
