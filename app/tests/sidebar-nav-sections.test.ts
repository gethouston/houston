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

const NAV = read("../src/components/shell/sidebar-nav-sections.tsx");
const HOOK = read("../src/components/shell/use-sidebar-nav-items.tsx");
const FOOTER = read("../src/components/shell/sidebar-footer.tsx");
const HELP = read("../src/components/shell/sidebar-help-menu.tsx");
const VIEWS = read("../src/lib/top-level-views.ts");

/** The source of one nav section, from its id to the next section's. */
function navSection(id: string): string {
  const marker = `      id: "${id}",`;
  const start = NAV.indexOf(marker);
  assert.ok(start >= 0, `the rail declares a "${id}" section`);
  const next = NAV.indexOf('      id: "', start + marker.length);
  return next === -1 ? NAV.slice(start) : NAV.slice(start, next);
}

/** Every `...(gate ? [rows] : [])` in a section, in source order. */
function gatedRuns(source: string): [string, string][] {
  return [...source.matchAll(/\.\.\.\((\w+) \? \[([^\]]*)\] : \[\]\)/g)].map(
    (m) => [m[1] as string, m[2] as string],
  );
}

describe("the rail's unlabelled run", () => {
  const primary = navSection("primary");

  it("is Inbox, About me, Agent store, in that order and nothing else", () => {
    const order = ["INBOX_VIEW_ID", "ABOUT_ME_VIEW_ID", "STORE_VIEW_ID"].map(
      (id) => primary.indexOf(`id: ${id},`),
    );
    assert.ok(
      order.every((i) => i >= 0),
      "all three rows are declared",
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.equal(
      primary.match(/\n {10}id: /g)?.length,
      3,
      "the run leads the rail with exactly three rows",
    );
  });

  it("gives About me a real destination, ungated", () => {
    // Standing context about the PERSON exists in every deployment, so the row
    // sits in the UNGATED lead run rather than behind any of the band gates,
    // and it navigates like every other row instead of arming something.
    assert.ok(primary.includes("onClick: () => setViewMode(ABOUT_ME_VIEW_ID)"));
    assert.ok(primary.includes('label: t("shell:sidebar.aboutMe")'));
    assert.ok(VIEWS.includes("ABOUT_ME_VIEW_ID"), "a real top-level view");
  });

  it("carries no row that points at no screen", () => {
    // "Guide me" was exactly that: the one entry that could never light,
    // holding a permanent slot among destinations. It moved to the footer's
    // help control, so nothing here arms the tour any more.
    assert.ok(!NAV.includes("GUIDE_ME_NAV_ID"));
    assert.ok(!NAV.includes("startTour"));
    assert.ok(!NAV.includes("active: false"));
    assert.ok(!VIEWS.includes("guide-me"), "no view claims that id either");
    assert.ok(!HOOK.includes("setUiTourActive"));
  });
});

describe("the rail's Workspace band", () => {
  const workspace = navSection("workspace");

  it("is Admin and Skills, each on its own gate, and nothing else", () => {
    // Permissions is gone (a team's Manage agents section is the one door onto
    // agent policy) and Time worked is a lens inside Admin > Analytics, so the
    // band is down to the two rows that are still their own screen.
    assert.deepEqual(gatedRuns(workspace), [
      ["showOrganization", "organization"],
      ["showSkills", "skills"],
    ]);
  });

  it("comes out EMPTY when every gate is off, so the library drops it", () => {
    // The band is not conditional anywhere: `SidebarNavList` filters sections
    // on `items.length`, so proving no row is UNGATED proves a plain member
    // sees no Workspace band at all.
    const items = workspace.slice(workspace.indexOf("items: ["));
    const ungated = items.replace(/\.\.\.\(\w+ \? \[[^\]]*\] : \[\]\),/g, "");
    assert.ok(!ungated.includes("id:"), "no row sits outside a gate");
  });

  it("routes Admin at the promoted top-level view", () => {
    assert.ok(NAV.includes("id: ORGANIZATION_VIEW_ID"));
    assert.ok(NAV.includes("onClick: () => setViewMode(ORGANIZATION_VIEW_ID)"));
    assert.ok(!NAV.includes("PERMISSIONS_VIEW_ID"), "no Permissions row");
    assert.ok(!NAV.includes("TIME_WORKED_VIEW_ID"), "no Time worked row");
  });

  it("names it with the string the Settings index already owned", () => {
    // ONE `t` for the whole rail: `settings` joined `SidebarChromeT` rather
    // than the hook taking a second subscription, and the screen keeps the name
    // it already had instead of growing a duplicate string.
    assert.ok(NAV.includes('label: t("settings:nav.organization")'));
    assert.equal(HOOK.includes("useTranslation"), false);
  });

  it("keeps the Skills row's tour anchor", () => {
    assert.ok(NAV.includes('dataAttrs: tourAnchor("nav-skills")'));
  });
});

describe("Settings left the nav for the footer", () => {
  it("is in no nav section at all", () => {
    assert.ok(!NAV.includes("SETTINGS_VIEW_ID"));
    assert.ok(!NAV.includes('tourAnchor("nav-settings")'));
    assert.ok(!NAV.includes("openSettingsIndex"));
  });

  it("is drawn in the footer through the library's own row", () => {
    assert.ok(
      FOOTER.includes('import { SidebarNavItem } from "@houston-ai/layout"'),
    );
    assert.ok(FOOTER.includes("<SidebarNavItem"));
    assert.ok(FOOTER.includes("collapsed={props.collapsed}"));
  });

  it("keeps the tour's Settings anchor resolving, and opens the INDEX", () => {
    assert.ok(FOOTER.includes('dataAttrs={tourAnchor("nav-settings")}'));
    assert.ok(FOOTER.includes("openSettings(null)"));
    assert.ok(FOOTER.includes("setMobileSidebarOpen(false)"));
    assert.ok(FOOTER.includes("active={viewMode === SETTINGS_VIEW_ID}"));
  });

  it("sits beside the footer's help control, not above a nav row", () => {
    // "Guide me" and "Report a problem" are the two things a stuck user reaches
    // for, and neither is a destination, so they are menu items on a control
    // next to the gear rather than rows among the app's screens.
    assert.ok(FOOTER.includes("<SidebarHelpMenu"));
    assert.ok(FOOTER.includes("collapsed={props.collapsed}"));
    assert.ok(FOOTER.includes('help: t("sidebar.help")'));
    assert.ok(FOOTER.includes('guideMe: t("sidebar.guideMe")'));
    assert.ok(FOOTER.includes('reportProblem: t("sidebar.reportProblem")'));
    // Report a problem opens the ONE bug-report surface rather than a second
    // copy of it.
    assert.ok(FOOTER.includes('openSettings("reportBug")'));
  });

  it("is the rail's last row: the avatar menu below it is gone", () => {
    // The account avatar expanded into "Account settings", which opened THIS
    // row's destination — a second door onto one page. Identity moved into the
    // Settings index (`settings/identity-header.tsx`), so nothing about a user
    // menu may survive in the footer.
    assert.ok(!FOOTER.includes("UserMenu"));
    assert.ok(!FOOTER.includes("user-menu"));
    // What remains below Settings is ambient status, not a destination.
    assert.ok(
      FOOTER.indexOf("<SidebarNavItem") < FOOTER.indexOf("<UpdateChecker"),
    );
  });
});

describe("the Guide me composition", () => {
  it("goes home BEFORE arming the tour", () => {
    // The overlay measures its first target the moment it mounts and every
    // anchor lives in the workspace shell, so arming first spotlights nothing.
    // The composition moved to the footer with the affordance itself.
    const start = FOOTER.indexOf("onGuideMe={() => {");
    assert.ok(start >= 0, "the footer composes onGuideMe");
    const body = FOOTER.slice(start);
    assert.ok(
      body.indexOf("openHome();") < body.indexOf("setUiTourActive(true);"),
    );
  });

  it("keeps the tour's replay anchor on the control that replays it", () => {
    // The `appTour` step spotlights whatever a user clicks to run the tour
    // again. That is the help control now, so the anchor travels with it, and
    // nothing in the nav may still claim it.
    assert.ok(HELP.includes('tourAnchor("appTour")'));
    assert.ok(!NAV.includes('tourAnchor("appTour")'));
  });

  it("runs both menu items one tick AFTER the menu closes", () => {
    // Radix restores focus to the trigger when its content unmounts, which
    // lands after a synchronous handler has already mounted the tour overlay or
    // moved the view. The band's create menu defers for the same reason.
    assert.ok(HELP.includes("onSelect={() => setTimeout(onGuideMe, 0)}"));
    assert.ok(HELP.includes("onSelect={() => setTimeout(onReportProblem, 0)}"));
  });
});
