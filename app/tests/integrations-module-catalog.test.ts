import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  browseCatalog,
  categoriesOf,
  categoryLabel,
  splitByGrant,
} from "../src/components/integrations/model.ts";

const tk = (
  slug: string,
  name: string,
  categories: string[] = [],
  description = "",
): IntegrationToolkit => ({ slug, name, categories, description });

const CATALOG: IntegrationToolkit[] = [
  tk("gmail", "Gmail", ["productivity"], "Email by Google"),
  tk("googlecalendar", "Google Calendar", ["productivity"]),
  tk("slack", "Slack", ["collaboration"]),
  tk("notion", "Notion", ["collaboration", "developer-tools"]),
  tk("serpapi", "SerpApi", ["developer-tools"], "Search engine results"),
];

describe("browseCatalog (new module)", () => {
  it("excludes connected apps and preserves catalog (usage-ranked) order", () => {
    const result = browseCatalog({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(["gmail"]),
    });
    deepStrictEqual(
      result.map((t) => t.slug),
      ["googlecalendar", "slack", "notion", "serpapi"],
    );
  });

  it("keeps every app when `connected` is empty (picker renders them connected)", () => {
    const result = browseCatalog({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(),
    });
    deepStrictEqual(
      result.map((t) => t.slug),
      ["gmail", "googlecalendar", "slack", "notion", "serpapi"],
    );
  });

  it("filters by category, then by search over name/slug/description", () => {
    const byCategory = browseCatalog({
      catalog: CATALOG,
      query: "",
      category: "collaboration",
      connected: new Set(),
    });
    deepStrictEqual(
      byCategory.map((t) => t.slug),
      ["slack", "notion"],
    );

    const byDescription = browseCatalog({
      catalog: CATALOG,
      query: "search engine",
      category: "all",
      connected: new Set(),
    });
    deepStrictEqual(
      byDescription.map((t) => t.slug),
      ["serpapi"],
    );

    const stacked = browseCatalog({
      catalog: CATALOG,
      query: "notion",
      category: "collaboration",
      connected: new Set(),
    });
    deepStrictEqual(
      stacked.map((t) => t.slug),
      ["notion"],
    );
  });

  it("no matches → empty (the UI shows the no-results line, not a blank)", () => {
    deepStrictEqual(
      browseCatalog({
        catalog: CATALOG,
        query: "zzz",
        category: "all",
        connected: new Set(),
      }),
      [],
    );
  });
});

describe("categoriesOf / categoryLabel (new module)", () => {
  it("collects unique categories sorted by display label", () => {
    deepStrictEqual(categoriesOf(CATALOG), [
      "collaboration",
      "developer-tools",
      "productivity",
    ]);
  });

  it("labels kebab-case categories for humans", () => {
    strictEqual(categoryLabel("developer-tools"), "Developer tools");
  });
});

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
): IntegrationConnection => ({
  toolkit,
  connectionId: `ca_${toolkit}`,
  status,
});

describe("splitByGrant (new module)", () => {
  it("puts granted connections under granted, the rest under available", () => {
    const { granted, available } = splitByGrant({
      connections: [conn("gmail"), conn("slack", "pending"), conn("notion")],
      grants: new Set(["gmail", "notion"]),
    });
    deepStrictEqual(
      granted.map((c) => c.toolkit),
      ["gmail", "notion"],
    );
    deepStrictEqual(
      available.map((c) => c.toolkit),
      ["slack"],
    );
  });

  it("empty grant set → everything available, nothing granted", () => {
    const { granted, available } = splitByGrant({
      connections: [conn("gmail"), conn("slack")],
      grants: new Set(),
    });
    deepStrictEqual(granted, []);
    deepStrictEqual(
      available.map((c) => c.toolkit),
      ["gmail", "slack"],
    );
  });

  it("preserves connection order within each bucket", () => {
    const { granted, available } = splitByGrant({
      connections: [conn("z"), conn("a"), conn("m"), conn("b")],
      grants: new Set(["z", "m"]),
    });
    deepStrictEqual(
      granted.map((c) => c.toolkit),
      ["z", "m"],
    );
    deepStrictEqual(
      available.map((c) => c.toolkit),
      ["a", "b"],
    );
  });
});
