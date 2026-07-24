import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  appDisplay,
  fallbackLogo,
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

  it("falls back to slug name + favicon guess when the toolkit is absent entirely", () => {
    const app = appDisplay("quickbooks", undefined);
    strictEqual(app.name, "quickbooks");
    strictEqual(app.logoUrl, fallbackLogo("quickbooks"));
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
