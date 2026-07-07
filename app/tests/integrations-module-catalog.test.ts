import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  accountDisplayLabel,
  browseCatalog,
  categoriesOf,
  categoryLabel,
  groupConnectionsByToolkit,
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
  connectionId = `ca_${toolkit}`,
  accountLabel?: string,
): IntegrationConnection => ({
  toolkit,
  connectionId,
  status,
  ...(accountLabel !== undefined ? { accountLabel } : {}),
});

describe("splitByGrant (new module)", () => {
  it("buckets by granted connectionId, not toolkit", () => {
    // Two Gmail accounts; only the first connectionId is granted.
    const { granted, available } = splitByGrant({
      connections: [
        conn("gmail", "active", "ca_g1"),
        conn("gmail", "active", "ca_g2"),
        conn("slack", "pending", "ca_s1"),
      ],
      grants: new Set(["ca_g1"]),
    });
    deepStrictEqual(
      granted.map((c) => c.connectionId),
      ["ca_g1"],
    );
    deepStrictEqual(
      available.map((c) => c.connectionId),
      ["ca_g2", "ca_s1"],
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

  it("ignores a granted id with no matching connection", () => {
    const { granted } = splitByGrant({
      connections: [conn("gmail", "active", "ca_g1")],
      grants: new Set(["ca_g1", "ca_ghost"]),
    });
    deepStrictEqual(
      granted.map((c) => c.connectionId),
      ["ca_g1"],
    );
  });

  it("preserves connection order within each bucket", () => {
    const { granted, available } = splitByGrant({
      connections: [
        conn("z", "active", "cz"),
        conn("a", "active", "ca"),
        conn("m", "active", "cm"),
        conn("b", "active", "cb"),
      ],
      grants: new Set(["cz", "cm"]),
    });
    deepStrictEqual(
      granted.map((c) => c.connectionId),
      ["cz", "cm"],
    );
    deepStrictEqual(
      available.map((c) => c.connectionId),
      ["ca", "cb"],
    );
  });
});

describe("groupConnectionsByToolkit (new module)", () => {
  it("groups accounts under one entry per toolkit, first-seen order", () => {
    const result = groupConnectionsByToolkit([
      conn("gmail", "active", "ca_g1"),
      conn("slack", "active", "ca_s1"),
      conn("gmail", "error", "ca_g2"),
    ]);
    deepStrictEqual(
      result.map((g) => g.toolkit),
      ["gmail", "slack"],
    );
    deepStrictEqual(
      result[0].connections.map((c) => c.connectionId),
      ["ca_g1", "ca_g2"],
    );
    deepStrictEqual(
      result[1].connections.map((c) => c.connectionId),
      ["ca_s1"],
    );
  });

  it("returns an empty array for no connections", () => {
    deepStrictEqual(groupConnectionsByToolkit([]), []);
  });
});

describe("accountDisplayLabel (new module)", () => {
  it("uses the account's own label when present", () => {
    strictEqual(
      accountDisplayLabel(
        conn("gmail", "active", "ca_abcd1234", "Work"),
        "Unnamed account",
      ),
      "Work",
    );
  });

  it("falls back to the unnamed word plus the last 4 id chars", () => {
    strictEqual(
      accountDisplayLabel(
        conn("gmail", "active", "ca_abcd1234"),
        "Unnamed account",
      ),
      "Unnamed account 1234",
    );
  });
});
