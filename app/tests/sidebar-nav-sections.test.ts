import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The rail's nav model, guarded on its SOURCE.
 *
 * `buildSidebarNavItems` puts a Lucide element in every row's `icon`, so it
 * lives in a `.tsx` and the node runner (`--experimental-strip-types`, no JSX
 * loader) cannot import it. Reading the module is the repo's standing idiom for
 * exactly that (`settings-view-gates.test.ts`, `card-unification.test.ts`), and
 * the assertions below are written against structure that cannot be satisfied
 * by accident: run order, the gate each row rides on, and the rows that must
 * NOT be there.
 */
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const SECTIONS = read("../src/components/shell/sidebar-nav-sections.tsx");
const ROWS = read("../src/components/shell/sidebar-nav-rows.tsx");
/** Both halves of the model: the runs that compose it and the gated rows it
 *  composes. A row moving between the two files is a refactor, not an IA
 *  change, so every "the rail says X" assertion reads them as one source. */
const NAV = `${SECTIONS}\n${ROWS}`;
const HOOK = read("../src/components/shell/use-sidebar-nav-items.tsx");
const VIEWS = read("../src/lib/top-level-views.ts");
const SETTINGS_SECTIONS = read("../src/lib/settings-sections.ts");

/** The source of one nav section, from its id to the next section's. */
function navSection(id: string): string {
  const marker = `      id: "${id}",`;
  const start = SECTIONS.indexOf(marker);
  assert.ok(start >= 0, `the rail declares a "${id}" section`);
  const next = SECTIONS.indexOf('      id: "', start + marker.length);
  return next === -1 ? SECTIONS.slice(start) : SECTIONS.slice(start, next);
}

/** Every `...(gate ? [rows] : [])` in a section, in source order. */
function gatedRuns(source: string): [string, string][] {
  return [...source.matchAll(/\.\.\.\((\w+) \? \[([^\]]*)\] : \[\]\)/g)].map(
    (m) => [m[1] as string, m[2] as string],
  );
}

describe("the rail's primary run", () => {
  const primary = navSection("primary");

  it("is Houston, AI Models, Integrations and Skills only", () => {
    assert.deepEqual(gatedRuns(primary), [
      ["showAssistant", "assistant"],
      ["showAiModels", "aiModels"],
      ["showSkills", "skills"],
    ]);
    assert.equal(
      primary.match(/\n {10}id: /g)?.length,
      1,
      "the run declares Integrations as its only unconditional row",
    );
    assert.ok(primary.includes("id: INTEGRATIONS_VIEW_ID"));
  });

  it("is led by the Assistant, then AI Models, then Integrations", () => {
    // Discovery, not a role: a deployment that serves no assistant has no
    // address to open a chat at, so the row must not exist there. It leads the
    // run, ahead of AI Models and Integrations.
    assert.ok(
      primary.indexOf("showAssistant ?") < primary.indexOf("showAiModels ?"),
      "Houston leads the run",
    );
    assert.ok(
      primary.indexOf("showAiModels ?") <
        primary.indexOf("id: INTEGRATIONS_VIEW_ID"),
      "AI Models comes before Integrations",
    );
    assert.ok(NAV.includes("onClick: () => setViewMode(ASSISTANT_VIEW_ID)"));
    assert.ok(NAV.includes('label: t("shell:sidebar.assistant")'));
    assert.ok(VIEWS.includes("ASSISTANT_VIEW_ID"), "a real top-level view");
    // Houston leads the run wearing its animated orb, not a static glyph.
    assert.ok(
      ROWS.includes("icon: <HoustonLogo />"),
      "the row renders the logo",
    );
    assert.ok(!ROWS.includes("Sparkles"), "no static sparkle glyph remains");
    assert.ok(
      HOOK.includes("showAssistant"),
      "the hook feeds the gate from useSurfaceGates",
    );
  });

  it("leaves About me to Settings and the Academy to the footer", () => {
    // What the agents know about the PERSON is a standing preference, so it is
    // a Settings section; the Academy is the rail's footer cluster, above
    // Settings. Neither may hold a slot among the destinations as well.
    assert.ok(!NAV.includes("ABOUT_ME_VIEW_ID"));
    // The Academy row is BUILT in `sidebar-nav-rows.tsx` for the two footer
    // clusters, so it is the composition of destinations that must not hold
    // it, not the row file the footer imports from.
    assert.ok(!SECTIONS.includes("ACADEMY_VIEW_ID"));
    assert.ok(!VIEWS.includes("ABOUT_ME_VIEW_ID"), "no such top-level view");
    assert.ok(
      SETTINGS_SECTIONS.includes('"aboutMe"'),
      "About me is a settings section id",
    );
  });

  it("carries no Inbox row, and nothing subscribes to data for one", () => {
    // The Inbox screen is gone, so neither its row nor the unread-mention
    // badge that rode its trailing slot may survive: the nav model stays a
    // pure build and the hook that feeds it subscribes to no list at all.
    assert.ok(!NAV.includes("INBOX_VIEW_ID"));
    assert.ok(!NAV.includes("buildInboxBadge"));
    assert.equal(primary.match(/trailing:/g)?.length, undefined);
    assert.ok(!HOOK.includes("useMentionInbox"));
    assert.ok(!VIEWS.includes("INBOX_VIEW_ID"), "no such top-level view");
  });

  it("carries no row that points at no screen", () => {
    // A row that can never light would hold a permanent slot among
    // destinations.
    assert.ok(!NAV.includes("active: false"));
  });
});

describe("the rail's labelled bands", () => {
  it("declares exactly ONE run, so nothing is labelled above Your AI Employees", () => {
    // "Your AI Employees" is the rail's only band. A second heading over a run of
    // destinations would be a second rule for one row shape, and the rows that
    // LEAD the rail need no heading to be found.
    assert.equal(
      SECTIONS.match(/\n {6}id: "/g)?.length,
      1,
      "one nav section is composed",
    );
    assert.ok(!SECTIONS.includes('id: "workspace"'), "no Workspace band");
    assert.ok(!SECTIONS.includes('label: t("shell:sidebar.workspace")'));
    assert.ok(!SECTIONS.includes("collapsed:"), "no band fold to compose");
    assert.ok(!HOOK.includes("workspaceSectionCollapsed"), "and none to read");
  });

  it("does not route Admin as a top-level destination", () => {
    assert.ok(!NAV.includes("id: ORGANIZATION_VIEW_ID"));
    assert.ok(!NAV.includes("setViewMode(ORGANIZATION_VIEW_ID)"));
    assert.ok(!NAV.includes("PERMISSIONS_VIEW_ID"), "no Permissions row");
    assert.ok(!NAV.includes("TIME_WORKED_VIEW_ID"), "no Time worked row");
  });

  it("keeps Admin out of Settings and gives Skills its own row", () => {
    // Admin is the rail footer's screen (sidebar-footer.tsx); the shared
    // library is a destination in the leading run, on the space-owner gate.
    assert.ok(!SETTINGS_SECTIONS.includes('"workspace"'));
    assert.ok(!SETTINGS_SECTIONS.includes('"skills"'), "not a section");
    assert.ok(!NAV.includes('label: t("settings:nav.workspace")'));
    assert.ok(NAV.includes("id: SKILLS_VIEW_ID"), "the Skills row");
    assert.ok(NAV.includes('label: t("shell:sidebar.skills")'));
    assert.ok(NAV.includes("onClick: () => setViewMode(SKILLS_VIEW_ID)"));
    assert.ok(VIEWS.includes("SKILLS_VIEW_ID"), "a real top-level view");
    // The Houston tour lesson stops on it, so it carries the anchor, and the
    // specs keep their own stable handle beside it.
    assert.ok(NAV.includes('tourAnchor("nav-skills")'), "the Skills anchor");
    assert.ok(NAV.includes('"data-testid": "rail-skills"'));
  });

  it("puts Skills directly after Integrations, on the space-owner gate", () => {
    const primary = navSection("primary");
    assert.ok(
      primary.indexOf("id: INTEGRATIONS_VIEW_ID") <
        primary.indexOf("showSkills ?"),
      "Skills follows Integrations",
    );
    assert.ok(
      HOOK.includes("showSkills"),
      "the hook feeds the gate from useSurfaceGates",
    );
  });
});
