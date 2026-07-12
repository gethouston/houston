import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  groupCatalogByCategory,
  UNCATEGORIZED,
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
  tk("asana", "Asana", ["productivity"]),
  tk("slack", "Slack", ["communication"]),
  tk("discord", "Discord", ["communication"]),
  tk("notion", "Notion", ["collaboration", "developer-tools"]),
  tk("serpapi", "SerpApi", ["developer-tools"], "Search engine results"),
  tk("random", "Random Tool"),
];

/** Collapse sections to a comparable [category, slugs] shape. */
const shape = (
  sections: { category: string; connectable: IntegrationToolkit[] }[],
) => sections.map((s) => [s.category, s.connectable.map((t) => t.slug)]);

describe("groupCatalogByCategory (new module)", () => {
  it("groups by PRIMARY category and orders sections by size desc", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
    });
    // productivity (3) leads, then communication (2), then the two size-1
    // sections tie-broken by label ("Collaboration" < "Developer tools"),
    // and the uncategorized catch-all pinned last regardless of size.
    deepStrictEqual(shape(sections), [
      ["productivity", ["asana", "gmail", "googlecalendar"]],
      ["communication", ["discord", "slack"]],
      ["collaboration", ["notion"]],
      ["developer-tools", ["serpapi"]],
      [UNCATEGORIZED, ["random"]],
    ]);
  });

  it("places a multi-category app in its first category only", () => {
    // notion is [collaboration, developer-tools] → collaboration only.
    const sections = groupCatalogByCategory({
      catalog: [tk("notion", "Notion", ["collaboration", "developer-tools"])],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(shape(sections), [["collaboration", ["notion"]]]);
  });

  it("collapses missing and empty-array categories into UNCATEGORIZED, sorted last", () => {
    const sections = groupCatalogByCategory({
      catalog: [
        tk("noCats", "No Cats"),
        tk("emptyCats", "Empty Cats", []),
        tk("real", "Real App", ["productivity"]),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(shape(sections), [
      ["productivity", ["real"]],
      [UNCATEGORIZED, ["emptyCats", "noCats"]],
    ]);
  });

  it("sorts sections of equal size by categoryLabel ascending", () => {
    const sections = groupCatalogByCategory({
      catalog: [
        tk("z1", "Z One", ["zebra"]),
        tk("a1", "A One", ["alpha"]),
        tk("m1", "M One", ["mango"]),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(
      sections.map((s) => s.category),
      ["alpha", "mango", "zebra"],
    );
  });

  it("sorts apps A-Z within a section, case-insensitively", () => {
    const sections = groupCatalogByCategory({
      catalog: [
        tk("zoom", "Zoom", ["communication"]),
        tk("airmeet", "airmeet", ["communication"]),
        tk("bluejeans", "BlueJeans", ["communication"]),
      ],
      query: "",
      connected: new Set(),
    });
    // airmeet (lowercase) before BlueJeans before Zoom.
    deepStrictEqual(shape(sections), [
      ["communication", ["airmeet", "bluejeans", "zoom"]],
    ]);
  });

  it("excludes connected apps and drops sections left empty", () => {
    // slack + discord connected → the whole communication section disappears.
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(["slack", "discord", "gmail"]),
    });
    deepStrictEqual(shape(sections), [
      ["productivity", ["asana", "googlecalendar"]],
      ["collaboration", ["notion"]],
      ["developer-tools", ["serpapi"]],
      [UNCATEGORIZED, ["random"]],
    ]);
  });

  it("filters by query over name, slug, and description, then groups", () => {
    // "search engine" matches SerpApi's description only.
    const byDescription = groupCatalogByCategory({
      catalog: CATALOG,
      query: "search engine",
      connected: new Set(),
    });
    deepStrictEqual(shape(byDescription), [["developer-tools", ["serpapi"]]]);

    // "goog" matches Gmail's description ("Email by Google") + googlecalendar's slug.
    const bySlugAndDesc = groupCatalogByCategory({
      catalog: CATALOG,
      query: "GOOG",
      connected: new Set(),
    });
    deepStrictEqual(shape(bySlugAndDesc), [
      ["productivity", ["gmail", "googlecalendar"]],
    ]);
  });

  it("composes the query filter with connected exclusion", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "goog",
      connected: new Set(["gmail"]),
    });
    // gmail excluded first, leaving only googlecalendar for the query.
    deepStrictEqual(shape(sections), [["productivity", ["googlecalendar"]]]);
  });

  it("returns an empty array when everything is filtered out", () => {
    deepStrictEqual(
      groupCatalogByCategory({
        catalog: CATALOG,
        query: "zzz-no-such-app",
        connected: new Set(),
      }),
      [],
    );
  });
});
