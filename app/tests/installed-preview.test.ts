import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import type { AppDisplay } from "../src/components/integrations/app-display.ts";
import {
  filterInstalled,
  filterInstalledBy,
  filterInstalledSkills,
  type InstalledRow,
  installedPreview,
  sortSkillsByTitle,
} from "../src/lib/installed-preview.ts";
import type { SkillSummary } from "../src/lib/types.ts";

const CAP = 6;
const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("installedPreview", () => {
  it("shows all with no expander at exactly the cap (boundary)", () => {
    const { visible, showExpander } = installedPreview(seq(CAP), {
      searching: false,
      expanded: false,
      cap: CAP,
    });
    deepStrictEqual(visible, seq(CAP));
    deepStrictEqual(showExpander, false);
  });

  it("caps to the first `cap` and shows the expander one past the cap", () => {
    const { visible, showExpander } = installedPreview(seq(CAP + 1), {
      searching: false,
      expanded: false,
      cap: CAP,
    });
    deepStrictEqual(visible, seq(CAP));
    deepStrictEqual(showExpander, true);
  });

  it("shows every match uncapped with no expander while searching", () => {
    const { visible, showExpander } = installedPreview(seq(CAP + 5), {
      searching: true,
      expanded: false,
      cap: CAP,
    });
    deepStrictEqual(visible, seq(CAP + 5));
    deepStrictEqual(showExpander, false);
  });

  it("shows every item uncapped with no expander once expanded", () => {
    const { visible, showExpander } = installedPreview(seq(CAP + 5), {
      searching: false,
      expanded: true,
      cap: CAP,
    });
    deepStrictEqual(visible, seq(CAP + 5));
    deepStrictEqual(showExpander, false);
  });

  it("handles an empty list with no expander", () => {
    const { visible, showExpander } = installedPreview([], {
      searching: false,
      expanded: false,
      cap: CAP,
    });
    deepStrictEqual(visible, []);
    deepStrictEqual(showExpander, false);
  });
});

describe("sortSkillsByTitle", () => {
  it("sorts display titles in the supplied UI locale", () => {
    const skills = [
      { name: "zulu-slug", title: "Árbol" },
      { name: "alpha-slug", title: "Zebra" },
      { name: "middle-slug", title: "Éclair" },
    ] as SkillSummary[];

    deepStrictEqual(
      sortSkillsByTitle(skills, "es").map((skill) => skill.name),
      ["zulu-slug", "middle-slug", "alpha-slug"],
    );
  });
});

const conn = (toolkit: string): IntegrationConnection => ({
  toolkit,
  connectionId: `conn-${toolkit}`,
  status: "active",
});

const app = (name: string, description = ""): AppDisplay => ({
  toolkit: name.toLowerCase(),
  name,
  description,
  logoUrl: "",
});

const row = (
  toolkit: string,
  name: string,
  description = "",
): InstalledRow => ({
  connection: conn(toolkit),
  app: app(name, description),
});

const custom = (slug: string, name: string): CustomIntegrationView => ({
  slug,
  name,
  kind: "openapi",
  addedAtMs: 0,
  state: { status: "active", toolCount: 1 },
});

const ACTIVE: InstalledRow[] = [row("gmail", "Gmail"), row("slack", "Slack")];
const CUSTOM: CustomIntegrationView[] = [custom("acme-api", "Acme API")];

describe("filterInstalled", () => {
  it("keeps everything for a whitespace-only query (never a no-match)", () => {
    deepStrictEqual(filterInstalled(ACTIVE, CUSTOM, "   "), {
      active: ACTIVE,
      custom: CUSTOM,
      noMatches: false,
    });
  });

  it("matches app name and toolkit case-insensitively", () => {
    const byName = filterInstalled(ACTIVE, CUSTOM, "SLACK");
    deepStrictEqual(
      byName.active.map((r) => r.connection.toolkit),
      ["slack"],
    );
    deepStrictEqual(byName.custom, []);
    deepStrictEqual(byName.noMatches, false);
  });

  it("matches an active app by its description (browse-side parity)", () => {
    const rows = [row("gmail", "Gmail", "Email by Google")];
    const byDescription = filterInstalled(rows, [], "email");
    deepStrictEqual(
      byDescription.active.map((r) => r.connection.toolkit),
      ["gmail"],
    );
    deepStrictEqual(byDescription.noMatches, false);
  });

  it("matches a custom integration by name and slug", () => {
    const byCustomSlug = filterInstalled(ACTIVE, CUSTOM, "acme-api");
    deepStrictEqual(byCustomSlug.active, []);
    deepStrictEqual(
      byCustomSlug.custom.map((c) => c.slug),
      ["acme-api"],
    );
    deepStrictEqual(byCustomSlug.noMatches, false);
  });

  it("reports the no-match shape when a real query hits nothing", () => {
    deepStrictEqual(filterInstalled(ACTIVE, CUSTOM, "zzz-nope"), {
      active: [],
      custom: [],
      noMatches: true,
    });
  });
});

const CATALOG: IntegrationToolkit[] = [
  { slug: "gmail", name: "Gmail", categories: ["productivity"] },
  { slug: "slack", name: "Slack", categories: ["communication"] },
];

describe("filterInstalledBy", () => {
  it("applies the query only when the category is 'all'", () => {
    deepStrictEqual(
      filterInstalledBy(ACTIVE, CUSTOM, CATALOG, {
        query: "slack",
        category: "all",
      }),
      filterInstalled(ACTIVE, CUSTOM, "slack"),
    );
  });

  it("narrows active rows to the category and drops custom (no category)", () => {
    const byCategory = filterInstalledBy(ACTIVE, CUSTOM, CATALOG, {
      query: "",
      category: "productivity",
    });
    deepStrictEqual(
      byCategory.active.map((r) => r.connection.toolkit),
      ["gmail"],
    );
    deepStrictEqual(byCategory.custom, []);
    deepStrictEqual(byCategory.noMatches, false);
  });

  it("shows only custom rows for the pinned custom category", () => {
    const byCustom = filterInstalledBy(ACTIVE, CUSTOM, CATALOG, {
      query: "",
      category: "custom",
    });
    deepStrictEqual(byCustom.active, []);
    deepStrictEqual(byCustom.custom, CUSTOM);
    deepStrictEqual(byCustom.noMatches, false);
  });

  it("composes the custom category with the shared query", () => {
    const byCustom = filterInstalledBy(ACTIVE, CUSTOM, CATALOG, {
      query: "acme",
      category: "custom",
    });
    deepStrictEqual(byCustom.active, []);
    deepStrictEqual(
      byCustom.custom.map((item) => item.slug),
      ["acme-api"],
    );
  });

  it("composes the category filter with the query", () => {
    const composed = filterInstalledBy(ACTIVE, CUSTOM, CATALOG, {
      query: "slack",
      category: "productivity",
    });
    deepStrictEqual(composed.active, []);
    deepStrictEqual(composed.custom, []);
    deepStrictEqual(composed.noMatches, true);
  });

  it("keeps custom rows under 'all' + an empty query (everything shows)", () => {
    deepStrictEqual(
      filterInstalledBy(ACTIVE, CUSTOM, CATALOG, {
        query: "",
        category: "all",
      }),
      {
        active: ACTIVE,
        custom: CUSTOM,
        noMatches: false,
      },
    );
  });
});

const skill = (name: string, title: string | null = null): SkillSummary => ({
  name,
  title,
  description: "",
  version: 1,
  tags: [],
  created: null,
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  inputs: [],
  prompt_template: null,
});

const SKILLS: SkillSummary[] = [
  skill("send-email"),
  skill("invoicer", "Facturación"),
];

describe("filterInstalledSkills", () => {
  it("keeps everything for a whitespace-only query (never a no-match)", () => {
    deepStrictEqual(filterInstalledSkills(SKILLS, "  "), {
      filtered: SKILLS,
      noMatches: false,
    });
  });

  it("matches the humanized display title case-insensitively", () => {
    const bySend = filterInstalledSkills(SKILLS, "SEND");
    deepStrictEqual(
      bySend.filtered.map((s) => s.name),
      ["send-email"],
    );
    deepStrictEqual(bySend.noMatches, false);
  });

  it("matches the underlying slug even when the title differs", () => {
    const bySlug = filterInstalledSkills(SKILLS, "invoicer");
    deepStrictEqual(
      bySlug.filtered.map((s) => s.name),
      ["invoicer"],
    );
    deepStrictEqual(bySlug.noMatches, false);
  });

  it("reports the no-match shape when a real query hits nothing", () => {
    deepStrictEqual(filterInstalledSkills(SKILLS, "zzz-nope"), {
      filtered: [],
      noMatches: true,
    });
  });
});
