import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  appDisplay,
  fallbackLogo,
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
