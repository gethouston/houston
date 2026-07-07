import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  appDisplay,
  connectionRows,
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

describe("connectionRows", () => {
  const cx = (
    toolkit: string,
    connectionId: string,
  ): IntegrationConnection => ({ toolkit, connectionId, status: "active" });

  it("keeps one row per account, sorted by app name, exposing connectionId", () => {
    const rows = connectionRows(
      [cx("slack", "ca_s1"), cx("gmail", "ca_g1"), cx("gmail", "ca_g2")],
      [tk("gmail", "Gmail"), tk("slack", "Slack")],
    );
    // Sorted by name (Gmail before Slack); the two Gmail accounts both kept.
    deepStrictEqual(
      rows.map((r) => r.connectionId),
      ["ca_g1", "ca_g2", "ca_s1"],
    );
    // connectionId is exposed at the top level, not only inside `connection`.
    strictEqual(rows[0].connectionId, rows[0].connection.connectionId);
    strictEqual(rows[0].app.name, "Gmail");
  });
});
