import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  browseCatalog,
  browseCatalogView,
  categoriesOf,
  categoryLabel,
  categoryListView,
  toolkitsInCategory,
} from "../src/components/integrations/browse-model.ts";
import { splitByGrant } from "../src/components/integrations/model.ts";

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

describe("browseCatalogView (allowlist partition)", () => {
  it("single-player (allowlist null) → everything connectable, nothing locked", () => {
    const view = browseCatalogView({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(),
      allowlist: null,
    });
    deepStrictEqual(
      view.connectable.map((t) => t.slug),
      ["gmail", "googlecalendar", "notion", "serpapi", "slack"],
    );
    deepStrictEqual(view.locked, []);
  });

  it("splits blocked apps into `locked`, both lists A-Z", () => {
    const view = browseCatalogView({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(),
      allowlist: ["slack", "gmail"],
    });
    deepStrictEqual(
      view.connectable.map((t) => t.slug),
      ["gmail", "slack"],
    );
    // googlecalendar, notion, serpapi are outside the ceiling → locked, A-Z.
    deepStrictEqual(
      view.locked.map((t) => t.slug),
      ["googlecalendar", "notion", "serpapi"],
    );
  });

  it("an empty allowlist locks every app (nothing connectable)", () => {
    const view = browseCatalogView({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(),
      allowlist: [],
    });
    deepStrictEqual(view.connectable, []);
    deepStrictEqual(
      view.locked.map((t) => t.slug),
      ["gmail", "googlecalendar", "notion", "serpapi", "slack"],
    );
  });

  it("search still finds a blocked app as a locked row (not emptiness)", () => {
    // A member searching for an app the admin hasn't enabled must SEE it locked.
    const view = browseCatalogView({
      catalog: CATALOG,
      query: "serp",
      category: "all",
      connected: new Set(),
      allowlist: ["gmail"],
    });
    deepStrictEqual(view.connectable, []);
    deepStrictEqual(
      view.locked.map((t) => t.slug),
      ["serpapi"],
    );
  });

  it("excludes connected apps from both buckets before partitioning", () => {
    const view = browseCatalogView({
      catalog: CATALOG,
      query: "",
      category: "all",
      connected: new Set(["gmail", "notion"]),
      allowlist: ["gmail", "slack"],
    });
    // gmail + notion connected → gone from browse; slack allowed; the rest locked.
    deepStrictEqual(
      view.connectable.map((t) => t.slug),
      ["slack"],
    );
    deepStrictEqual(
      view.locked.map((t) => t.slug),
      ["googlecalendar", "serpapi"],
    );
  });

  it("category filter narrows before the allowlist partition", () => {
    const view = browseCatalogView({
      catalog: CATALOG,
      query: "",
      category: "collaboration",
      connected: new Set(),
      allowlist: ["notion"],
    });
    // collaboration = notion + slack; notion allowed, slack locked.
    deepStrictEqual(
      view.connectable.map((t) => t.slug),
      ["notion"],
    );
    deepStrictEqual(
      view.locked.map((t) => t.slug),
      ["slack"],
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
