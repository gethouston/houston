import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import {
  browseCatalogView,
  UNCATEGORIZED,
} from "../src/components/integrations/browse-model.ts";
import {
  catalogCategorySlugs,
  groupCatalogByCategory,
  MOST_USED,
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

/** The category grid alone — the {@link MOST_USED} spotlight (asserted on its
 *  own below) is orthogonal to how the size-ranked category buckets form. */
const categoryShape = (
  sections: { category: string; connectable: IntegrationToolkit[] }[],
) => shape(sections.filter((s) => s.category !== MOST_USED));

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

describe("groupCatalogByCategory most-used spotlight", () => {
  const mostUsedSlugs = (
    sections: { category: string; connectable: IntegrationToolkit[] }[],
  ) =>
    sections
      .find((s) => s.category === MOST_USED)
      ?.connectable.map((t) => t.slug);

  it("pins Most used first at rest, in curated MOST_USED_SLUGS order (not A-Z)", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
    });
    // First section is the spotlight; slugs follow the curated usage order
    // (gmail, googlecalendar, notion, slack, asana), NOT A-Z (which would open
    // with asana). Curated apps missing from this catalog (googledrive,
    // whatsapp…) simply drop out — the fallback for a shrunken catalog.
    deepStrictEqual(sections[0].category, MOST_USED);
    deepStrictEqual(
      sections[0].connectable.map((t) => t.slug),
      ["gmail", "googlecalendar", "notion", "slack", "asana"],
    );
  });

  it("orders members by curated usage rank, never alphabetically", () => {
    // All four are in MOST_USED_SLUGS; A-Z would open with instagram. The
    // curated usage ranks (twitter < linkedin < whatsapp < instagram) win.
    const sections = groupCatalogByCategory({
      catalog: [
        tk("instagram", "Instagram", ["social-media-accounts"]),
        tk("linkedin", "LinkedIn", ["social-media-accounts"]),
        tk("twitter", "Twitter", ["social-media-accounts"]),
        tk("whatsapp", "WhatsApp", ["team-chat"]),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(mostUsedSlugs(sections), [
      "twitter",
      "linkedin",
      "whatsapp",
      "instagram",
    ]);
  });

  it("keeps most-used apps in their own category sections too (a spotlight, not a move)", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
    });
    // gmail is in the spotlight AND still present in Productivity, A-Z.
    const productivity = sections.find((s) => s.category === "productivity");
    deepStrictEqual(
      productivity?.connectable.map((t) => t.slug),
      ["asana", "gmail", "googlecalendar"],
    );
  });

  it("omits Most used while a search query is active", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "gmail",
      connected: new Set(),
    });
    deepStrictEqual(mostUsedSlugs(sections), undefined);
  });

  it("omits Most used when narrowed to a single category", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(),
      category: "productivity",
    });
    deepStrictEqual(mostUsedSlugs(sections), undefined);
  });

  it("excludes already-connected apps from Most used", () => {
    const sections = groupCatalogByCategory({
      catalog: CATALOG,
      query: "",
      connected: new Set(["gmail", "slack"]),
    });
    deepStrictEqual(mostUsedSlugs(sections), [
      "googlecalendar",
      "notion",
      "asana",
    ]);
  });

  it("omits Most used entirely when no curated app is in the catalog", () => {
    const sections = groupCatalogByCategory({
      catalog: [
        tk("serpapi", "SerpApi", ["developer-tools"]),
        tk("random", "Random"),
      ],
      query: "",
      connected: new Set(),
    });
    deepStrictEqual(mostUsedSlugs(sections), undefined);
  });

  it("never leaks MOST_USED into the category dropdown options", () => {
    deepStrictEqual(
      catalogCategorySlugs({ catalog: CATALOG, connected: new Set() }).filter(
        (c) => c === MOST_USED,
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

describe("groupCatalogByCategory hides no-auth apps entirely", () => {
  // No-auth toolkits (web search, weather…) never surface in the catalog:
  // there is nothing to connect, so a row would only grow a Connect `+` that
  // can only fail. They stay agent-facing (search stamps their matches
  // connected server-side).
  const NOAUTH_CATALOG: IntegrationToolkit[] = [
    ...CATALOG,
    { ...tk("weathermap", "Weathermap", ["utilities"]), noAuth: true },
    { ...tk("test_app", "Test App", ["developer-tools"]), noAuth: true },
  ];

  it("keeps every no-auth app out of every section, at rest and under search", () => {
    const atRest = groupCatalogByCategory({
      catalog: NOAUTH_CATALOG,
      query: "",
      connected: new Set(),
    });
    const allSlugs = atRest.flatMap((s) => s.connectable.map((t) => t.slug));
    deepStrictEqual(
      allSlugs.some((s) => ["weathermap", "test_app"].includes(s)),
      false,
    );
    // A direct search for one finds nothing — hidden means hidden.
    deepStrictEqual(
      groupCatalogByCategory({
        catalog: NOAUTH_CATALOG,
        query: "weather",
        connected: new Set(),
      }),
      [],
    );
  });

  it("keeps no-auth apps out of a narrowed category section too", () => {
    deepStrictEqual(
      groupCatalogByCategory({
        catalog: NOAUTH_CATALOG,
        query: "",
        connected: new Set(),
        category: "utilities",
      }),
      [],
    );
  });

  it("does not let hidden no-auth apps create phantom dropdown options", () => {
    const slugs = catalogCategorySlugs({
      catalog: NOAUTH_CATALOG,
      connected: new Set(),
    });
    deepStrictEqual(slugs.includes("utilities"), false);
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
