import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { filterCatalog } from "../src/components/tabs/integrations-tab-model.ts";

const tk = (slug: string, name: string): IntegrationToolkit => ({ slug, name });

const CATALOG: IntegrationToolkit[] = [
  tk("gmail", "Gmail"),
  tk("googlecalendar", "Google Calendar"),
  tk("slack", "Slack"),
  tk("notion", "Notion"),
  tk("slackbot", "Slack Bot"),
  tk("mailchimp", "Mailchimp"),
];

describe("filterCatalog", () => {
  it("no query → the pinned popular apps, in pinned order, minus connected", () => {
    const result = filterCatalog({
      catalog: CATALOG,
      query: "",
      connected: new Set(["gmail"]),
      popular: ["gmail", "slack", "notion"],
    });
    deepStrictEqual(
      result.map((t) => t.slug),
      ["slack", "notion"],
    );
  });

  it("no query → pinned slugs missing from the catalog are skipped, not crashed on", () => {
    const result = filterCatalog({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
      popular: ["gmail", "not-in-catalog", "slack"],
    });
    deepStrictEqual(
      result.map((t) => t.slug),
      ["gmail", "slack"],
    );
  });

  it("searching matches name or slug case-insensitively, prefix hits first", () => {
    const result = filterCatalog({
      catalog: CATALOG,
      query: "SLA",
      connected: new Set(),
    });
    // Name-prefix matches ("Slack", "Slack Bot") come before others.
    deepStrictEqual(
      result.map((t) => t.slug),
      ["slack", "slackbot"],
    );

    const bySlug = filterCatalog({
      catalog: CATALOG,
      query: "googlecal",
      connected: new Set(),
    });
    deepStrictEqual(
      bySlug.map((t) => t.slug),
      ["googlecalendar"],
    );
  });

  it("searching never surfaces already-connected apps and respects the cap", () => {
    const result = filterCatalog({
      catalog: CATALOG,
      query: "a", // matches many
      connected: new Set(["gmail"]),
      limit: 2,
    });
    strictEqual(result.length, 2);
    strictEqual(
      result.some((t) => t.slug === "gmail"),
      false,
    );
  });

  it("no matches → empty (the UI shows the no-results line, not a blank)", () => {
    deepStrictEqual(
      filterCatalog({ catalog: CATALOG, query: "zzz", connected: new Set() }),
      [],
    );
  });
});
