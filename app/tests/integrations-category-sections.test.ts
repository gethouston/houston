import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  browseCatalogView,
  UNCATEGORIZED,
} from "../src/components/integrations/browse-model.ts";
import {
  catalogCategorySlugs,
  FEATURED,
  groupCatalogByCategory,
  READY,
} from "../src/components/integrations/browse-sections.ts";

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

/** The category grid alone — the {@link FEATURED} and {@link READY} pinned
 *  sections (asserted on their own below) are orthogonal to how the
 *  size-ranked category buckets form. */
const categoryShape = (
  sections: { category: string; connectable: IntegrationToolkit[] }[],
) =>
  shape(
    sections.filter((s) => s.category !== FEATURED && s.category !== READY),
  );

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
    deepStrictEqual(categoryShape(sections), [
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
    deepStrictEqual(categoryShape(sections), [["collaboration", ["notion"]]]);
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
    deepStrictEqual(categoryShape(sections), [
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
    deepStrictEqual(categoryShape(sections), [
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
    deepStrictEqual(categoryShape(sections), [
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
    deepStrictEqual(categoryShape(byDescription), [
      ["developer-tools", ["serpapi"]],
    ]);

    // "goog" matches Gmail's description ("Email by Google") + googlecalendar's slug.
    const bySlugAndDesc = groupCatalogByCategory({
      catalog: CATALOG,
      query: "GOOG",
      connected: new Set(),
    });
    deepStrictEqual(categoryShape(bySlugAndDesc), [
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
    deepStrictEqual(categoryShape(sections), [
      ["productivity", ["googlecalendar"]],
    ]);
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

describe("groupCatalogByCategory featured spotlight", () => {
  const featuredSlugs = (
    sections: { category: string; connectable: IntegrationToolkit[] }[],
  ) =>
    sections
      .find((s) => s.category === FEATURED)
      ?.connectable.map((t) => t.slug);

  it("pins Featured first at rest, in curated FEATURED_SLUGS order (not A-Z)", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
    });
    // First section is the spotlight; slugs follow the curated order
    // (gmail, googlecalendar, notion, slack, asana), NOT A-Z (which would open
    // with asana).
    deepStrictEqual(sections[0].category, FEATURED);
    deepStrictEqual(
      sections[0].connectable.map((t) => t.slug),
      ["gmail", "googlecalendar", "notion", "slack", "asana"],
    );
  });

  it("keeps featured apps in their own category sections too (a spotlight, not a move)", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
    });
    // gmail is featured AND still present in Productivity, A-Z.
    const productivity = sections.find((s) => s.category === "productivity");
    deepStrictEqual(
      productivity?.connectable.map((t) => t.slug),
      ["asana", "gmail", "googlecalendar"],
    );
  });

  it("omits Featured while a search query is active", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "gmail",
      connected: new Set(),
    });
    deepStrictEqual(featuredSlugs(sections), undefined);
  });

  it("omits Featured when narrowed to a single category", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
      category: "productivity",
    });
    deepStrictEqual(featuredSlugs(sections), undefined);
  });

  it("excludes already-connected apps from Featured", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(["gmail", "slack"]),
    });
    deepStrictEqual(featuredSlugs(sections), [
      "googlecalendar",
      "notion",
      "asana",
    ]);
  });

  it("omits Featured entirely when no featured app is in the catalog", () => {
    const sections = groupCatalogByCategory({
      catalog: [
        tk("serpapi", "SerpApi", ["developer-tools"]),
        tk("random", "Random"),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(featuredSlugs(sections), undefined);
  });

  it("never leaks FEATURED into the category dropdown options", () => {
    deepStrictEqual(
      catalogCategorySlugs({ catalog: CATALOG, connected: new Set() }).filter(
        (c) => c === FEATURED,
      ),
      [],
    );
  });
});

describe("groupCatalogByCategory narrowed to one category (any-match)", () => {
  /** Total rows the narrowed view renders across all its sections. */
  const rowCount = (
    sections: { category: string; connectable: IntegrationToolkit[] }[],
  ) => sections.reduce((n, s) => n + s.connectable.length, 0);

  /** The "Available" chip's number for the same query + category. */
  const chip = (query: string, category: string) =>
    browseCatalogView({
      catalog: CATALOG,
      query,
      category,
      connected: new Set(),
      allowlist: null,
    }).connectable.length;

  it("surfaces a SECONDARY-category app under that category (all in one section)", () => {
    // notion is [collaboration, developer-tools]; narrowing to developer-tools
    // (its secondary) must surface it beside serpapi (primary) — under the old
    // primary-only bucketing notion was unfindable here.
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
      category: "developer-tools",
    });
    deepStrictEqual(categoryShape(sections), [
      ["developer-tools", ["notion", "serpapi"]],
    ]);
  });

  it("renders exactly the chip count (rows === browseCatalogView.connectable)", () => {
    // Chip parity across categories: what the header promises equals what shows.
    for (const category of [
      "productivity",
      "communication",
      "collaboration",
      "developer-tools",
    ]) {
      const sections = groupCatalogByCategory({
        catalog: CATALOG,
        query: "",
        connected: new Set(),
        category,
      });
      deepStrictEqual(rowCount(sections), chip("", category));
    }
  });

  it("keeps chip parity once a query narrows further", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "goog",
      connected: new Set(),
      category: "productivity",
    });
    deepStrictEqual(categoryShape(sections), [
      ["productivity", ["gmail", "googlecalendar"]],
    ]);
    deepStrictEqual(rowCount(sections), chip("goog", "productivity"));
  });
});

describe("groupCatalogByCategory mainstream-first priority ordering", () => {
  const categoryOrder = (
    sections: { category: string; connectable: IntegrationToolkit[] }[],
  ) => categoryShape(sections).map(([c]) => c);

  it("floats a SMALL priority category ahead of a HUGE non-priority one", () => {
    // productivity has 1 app; developer-tools has 4. Raw size ranking would open
    // with "Developer tools" — the curated order must lead with productivity.
    const sections = groupCatalogByCategory({
      catalog: [
        tk("dt1", "DT One", ["developer-tools"]),
        tk("dt2", "DT Two", ["developer-tools"]),
        tk("dt3", "DT Three", ["developer-tools"]),
        tk("dt4", "DT Four", ["developer-tools"]),
        tk("asana", "Asana", ["productivity"]),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(categoryOrder(sections), [
      "productivity",
      "developer-tools",
    ]);
  });

  it("respects the relative CATEGORY_PRIORITY order among priority categories", () => {
    // Seeded so size ordering would REVERSE the curated order (productivity
    // biggest, team-chat smallest); the curated rank must win regardless.
    const sections = groupCatalogByCategory({
      catalog: [
        tk("p1", "P1", ["productivity"]),
        tk("p2", "P2", ["productivity"]),
        tk("p3", "P3", ["productivity"]),
        tk("tc1", "TC1", ["team-collaboration"]),
        tk("tc2", "TC2", ["team-collaboration"]),
        tk("t1", "T1", ["team-chat"]),
      ],
      query: "",
      connected: new Set(),
    });
    // team-chat < team-collaboration < productivity in CATEGORY_PRIORITY.
    deepStrictEqual(categoryOrder(sections), [
      "team-chat",
      "team-collaboration",
      "productivity",
    ]);
  });

  it("ranks spelling variants of a curated slug via normalization", () => {
    // The live Composio slug spelling isn't pinned down ("ads-&-conversion"
    // vs "ads-and-conversion"); both must rank as the same curated category,
    // ahead of a bigger non-priority one.
    for (const variant of ["ads-&-conversion", "ads-and-conversion"]) {
      const sections = groupCatalogByCategory({
        catalog: [
          tk("dt1", "DT One", ["developer-tools"]),
          tk("dt2", "DT Two", ["developer-tools"]),
          tk("ad1", "Ad One", [variant]),
        ],
        query: "",
        connected: new Set(),
      });
      deepStrictEqual(categoryOrder(sections), [variant, "developer-tools"]);
    }
  });

  it("orders non-priority categories by size DESC after every curated one", () => {
    const sections = groupCatalogByCategory({
      catalog: [
        // Two non-priority categories, sized so DESC ordering is observable.
        tk("z1", "Z1", ["zebra"]),
        tk("a1", "A1", ["alpha"]),
        tk("a2", "A2", ["alpha"]),
        // One priority category, smaller than both, must still lead.
        tk("p1", "P1", ["productivity"]),
        // Uncategorized always last.
        tk("u1", "U1"),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(categoryOrder(sections), [
      "productivity", // curated, leads despite being smallest
      "alpha", // non-priority, size 2
      "zebra", // non-priority, size 1
      UNCATEGORIZED, // pinned last
    ]);
  });

  it("keeps the category dropdown A-Z despite the section priority order", () => {
    // The page sections lead with productivity (curated), but the dropdown is a
    // lookup-by-name surface, so its options stay alphabetical.
    deepStrictEqual(
      catalogCategorySlugs({
        catalog: [
          tk("s1", "S1", ["sales"]),
          tk("p1", "P1", ["productivity"]),
          tk("c1", "C1", ["communication"]),
        ],
        connected: new Set(),
      }),
      ["communication", "productivity", "sales"],
    );
  });
});

describe("groupCatalogByCategory ready-to-use (no-auth) apps", () => {
  // Curated ready apps (READY_SLUGS) + one uncurated no-auth toolkit that must
  // never surface anywhere (there is nothing to connect AND it is not worth a
  // consumer catalog row).
  const READY_CATALOG: IntegrationToolkit[] = [
    ...CATALOG,
    { ...tk("weathermap", "Weathermap", ["utilities"]), noAuth: true },
    {
      ...tk("composio_search", "Composio Search", ["ai-agents"]),
      noAuth: true,
    },
    { ...tk("test_app", "Test App", ["developer-tools"]), noAuth: true },
  ];
  const readySlugs = (
    sections: { category: string; connectable: IntegrationToolkit[] }[],
  ) =>
    sections.find((s) => s.category === READY)?.connectable.map((t) => t.slug);

  it("pins Ready LAST at rest, in curated READY_SLUGS order", () => {
    const sections = groupCatalogByCategory({
      catalog: READY_CATALOG,
      query: "",
      connected: new Set(),
    });
    // The page leads with actionable (connectable) sections; Ready closes it.
    deepStrictEqual(sections[0].category, FEATURED);
    const last = sections[sections.length - 1];
    deepStrictEqual(last.category, READY);
    // READY_SLUGS order (composio_search first), not A-Z.
    deepStrictEqual(
      last.connectable.map((t) => t.slug),
      ["composio_search", "weathermap"],
    );
  });

  it("keeps every no-auth app out of the category buckets (no Connect row anywhere)", () => {
    const sections = groupCatalogByCategory({
      catalog: READY_CATALOG,
      query: "",
      connected: new Set(),
    });
    const bucketSlugs = sections
      .filter((s) => s.category !== READY && s.category !== FEATURED)
      .flatMap((s) => s.connectable.map((t) => t.slug));
    deepStrictEqual(
      bucketSlugs.some((s) =>
        ["weathermap", "composio_search", "test_app"].includes(s),
      ),
      false,
    );
  });

  it("survives a search query — ready apps have no other section to be found in", () => {
    const sections = groupCatalogByCategory({
      catalog: READY_CATALOG,
      query: "weather",
      connected: new Set(),
    });
    deepStrictEqual(shape(sections), [[READY, ["weathermap"]]]);
  });

  it("hides Ready when narrowed to a single category", () => {
    const sections = groupCatalogByCategory({
      catalog: READY_CATALOG,
      query: "",
      connected: new Set(),
      category: "utilities",
    });
    deepStrictEqual(readySlugs(sections), undefined);
    // And the no-auth app does not sneak into the narrowed section either.
    deepStrictEqual(shape(sections), []);
  });

  it("never surfaces an uncurated no-auth toolkit", () => {
    const sections = groupCatalogByCategory({
      catalog: READY_CATALOG,
      query: "test app",
      connected: new Set(),
    });
    deepStrictEqual(shape(sections), []);
  });

  it("never leaks READY into the category dropdown options", () => {
    const slugs = catalogCategorySlugs({
      catalog: READY_CATALOG,
      connected: new Set(),
    });
    deepStrictEqual(slugs.includes(READY), false);
    // The hidden no-auth apps' categories don't create phantom options either.
    deepStrictEqual(slugs.includes("utilities"), false);
    deepStrictEqual(slugs.includes("ai-agents"), false);
  });
});

describe("catalogCategorySlugs", () => {
  it("orders A-Z by label with UNCATEGORIZED last, regardless of section size", () => {
    deepStrictEqual(
      catalogCategorySlugs({ catalog: CATALOG, connected: new Set() }),
      [
        "collaboration",
        "communication",
        "developer-tools",
        "productivity",
        UNCATEGORIZED,
      ],
    );
  });

  it("drops categories emptied by the connected exclusion", () => {
    deepStrictEqual(
      catalogCategorySlugs({
        catalog: CATALOG,
        connected: new Set(["slack", "discord", "random"]),
      }),
      ["collaboration", "developer-tools", "productivity"],
    );
  });
});
