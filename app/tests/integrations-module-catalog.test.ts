import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  browseCatalog,
  categoriesOf,
  categoryLabel,
  categoryListView,
  toolkitsInCategory,
} from "../src/components/integrations/browse-model.ts";

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
  it("excludes connected apps and returns the rest alphabetically by name", () => {
    const result = browseCatalog({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(["gmail"]),
    });
    // Google Calendar, Notion, SerpApi, Slack (A-Z by name, not usage rank).
    deepStrictEqual(
      result.map((t) => t.slug),
      ["googlecalendar", "notion", "serpapi", "slack"],
    );
  });

  it("keeps every app when `connected` is empty, still sorted alphabetically", () => {
    const result = browseCatalog({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(),
    });
    deepStrictEqual(
      result.map((t) => t.slug),
      ["gmail", "googlecalendar", "notion", "serpapi", "slack"],
    );
  });

  it("sorts case-insensitively by name (mixed-case + out-of-order input)", () => {
    const mixed: IntegrationToolkit[] = [
      tk("z", "Zoom"),
      tk("a1", "airtable"),
      tk("b", "Box"),
      tk("a2", "Asana"),
    ];
    const result = browseCatalog({
      catalog: mixed,
      query: "",
      category: "all",
      connected: new Set(),
    });
    // airtable (lowercase) sorts before Asana; Box before Zoom.
    deepStrictEqual(
      result.map((t) => t.slug),
      ["a1", "a2", "b", "z"],
    );
  });

  it("applies category, then search, then sorts alphabetically", () => {
    const byCategory = browseCatalog({
      catalog: CATALOG,
      query: "",
      category: "collaboration",
      connected: new Set(),
    });
    // Filter keeps Slack + Notion; the sort reorders them to Notion, Slack.
    deepStrictEqual(
      byCategory.map((t) => t.slug),
      ["notion", "slack"],
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

describe("browseCatalog hides no-auth apps", () => {
  // No-auth toolkits never surface in the catalog: there is nothing to
  // connect (a Connect button could only 400 — the Auth_Config_NoAuthApp
  // prod crash). They stay agent-facing: search stamps their matches
  // connected server-side, so agents use the working ones directly.
  const NOAUTH_CATALOG: IntegrationToolkit[] = [
    ...CATALOG,
    { ...tk("weathermap", "Weathermap", ["utilities"]), noAuth: true },
    { ...tk("test_app", "Test App", ["developer-tools"]), noAuth: true },
  ];

  it("excludes every no-auth app from the browse list", () => {
    const all = browseCatalog({
      catalog: NOAUTH_CATALOG,
      query: "",
      category: "all",
      connected: new Set(),
    }).map((t) => t.slug);
    strictEqual(all.includes("weathermap"), false);
    strictEqual(all.includes("test_app"), false);
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

describe("toolkitsInCategory (new module)", () => {
  it("returns null for the 'all' sentinel (no filter)", () => {
    strictEqual(toolkitsInCategory(CATALOG, "all"), null);
  });

  it("collects every slug tagged with the category", () => {
    const set = toolkitsInCategory(CATALOG, "collaboration");
    deepStrictEqual([...(set ?? [])].sort(), ["notion", "slack"]);
  });

  it("matches apps carrying the category among several", () => {
    // notion is both collaboration + developer-tools.
    const set = toolkitsInCategory(CATALOG, "developer-tools");
    deepStrictEqual([...(set ?? [])].sort(), ["notion", "serpapi"]);
  });

  it("unknown category → empty set (not null)", () => {
    const set = toolkitsInCategory(CATALOG, "nope");
    strictEqual(set?.size, 0);
  });
});

describe("categoryListView (new module)", () => {
  it("visible rows → the list", () => {
    strictEqual(
      categoryListView({
        visibleCount: 3,
        hasAny: true,
        categoryFiltered: true,
      }),
      "list",
    );
  });

  it("no rows at all → the plain empty state", () => {
    strictEqual(
      categoryListView({
        visibleCount: 0,
        hasAny: false,
        categoryFiltered: false,
      }),
      "empty",
    );
  });

  it("some rows but hidden by the category → category-aware empty", () => {
    strictEqual(
      categoryListView({
        visibleCount: 0,
        hasAny: true,
        categoryFiltered: true,
      }),
      "empty-category",
    );
  });

  it("empty with a filter but nothing picked → plain empty (never lies)", () => {
    strictEqual(
      categoryListView({
        visibleCount: 0,
        hasAny: false,
        categoryFiltered: true,
      }),
      "empty",
    );
  });
});
