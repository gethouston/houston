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
const SHELL = read("../src/components/shell/workspace-shell.tsx");
const HELP = read("../src/components/shell/sidebar-help-menu.tsx");
const GUIDED_SETUP = read("../src/hooks/use-run-guided-setup.ts");
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

  it("is Inbox, About me, Academy, Agent store, in that order and nothing else", () => {
    const order = [
      "INBOX_VIEW_ID",
      "ABOUT_ME_VIEW_ID",
      "ACADEMY_VIEW_ID",
      "STORE_VIEW_ID",
    ].map((id) => primary.indexOf(`id: ${id},`));
    assert.ok(
      order.every((i) => i >= 0),
      "all four rows are declared",
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    assert.equal(
      primary.match(/\n {10}id: /g)?.length,
      4,
      "the run leads the rail with exactly four rows",
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

  it("gives the Academy a real destination, ungated, under About me", () => {
    // Learning the product ships in every deployment, so the row sits in the
    // UNGATED lead run beside About me rather than behind a band gate, and it
    // navigates like every other row instead of arming something.
    assert.ok(primary.includes("onClick: () => setViewMode(ACADEMY_VIEW_ID)"));
    assert.ok(primary.includes('label: t("shell:sidebar.academy")'));
    assert.ok(VIEWS.includes("ACADEMY_VIEW_ID"), "a real top-level view");
    assert.ok(
      primary.indexOf("id: ABOUT_ME_VIEW_ID,") <
        primary.indexOf("id: ACADEMY_VIEW_ID,"),
      "it follows About me",
    );
  });

  it("states unread mentions on the Inbox row, and nowhere else in the run", () => {
    // The trailing slot is where a nav row states live status, and the Inbox
    // count is the ONE thing stated there: built from an already-resolved
    // value, so the nav model stays a pure build and the hook that feeds it
    // stays the one place a rail row subscribes to data.
    assert.ok(primary.includes("trailing: buildInboxBadge(t, mentionCount)"));
    assert.equal(primary.match(/trailing:/g)?.length, 1);
    assert.ok(HOOK.includes("useMentionInbox(agents)"));
  });

  it("carries no row that points at no screen", () => {
    // "Guide me" was exactly that: the one entry that could never light,
    // holding a permanent slot among destinations. It moved to the footer's
    // help control, so nothing here arms the tour any more.
    assert.ok(!NAV.includes("GUIDE_ME_NAV_ID"));
    assert.ok(!NAV.includes("startTour"));
    assert.ok(!NAV.includes("active: false"));
    assert.ok(!VIEWS.includes("guide-me"), "no view claims that id either");
  });
});

describe("the rail's Workspace band", () => {
  const workspace = navSection("workspace");

  it("is Admin and Skills, each on its own gate, and nothing else", () => {
    // Permissions is gone (a team's focused agent screen is the one door onto
    // agent policy) and Time worked is a section inside Admin, so the
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

  it("routes Admin at the promoted top-level view, always onto its home", () => {
    assert.ok(NAV.includes("id: ORGANIZATION_VIEW_ID"));
    // The rail rule: the door opens the screen's HOME, never the kept-alive
    // leftover — so the click pins the landing section before navigating.
    assert.ok(
      NAV.includes("useOrgNav.getState().requestTab(DEFAULT_ORG_TAB)"),
      "pins the landing section",
    );
    assert.ok(NAV.includes("setViewMode(ORGANIZATION_VIEW_ID)"));
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
    assert.ok(FOOTER.includes("setMobileMoreOpen(false)"));
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
    // Nothing sits below Settings any more: the update surfaces (launch
    // overlay, restart pill) are window chrome mounted by the shell, not a
    // rail row.
    assert.ok(!FOOTER.includes("<UpdateChecker"));
    assert.ok(SHELL.includes("<UpdateChecker />"));
  });
});

describe("the Guide me composition", () => {
  it("goes home BEFORE arming the in-app onboarding", () => {
    // The onboarding operates over the workspace shell, so the store is left
    // first — arming against Settings would overlay the wrong surface.
    assert.ok(
      GUIDED_SETUP.indexOf("openHome();") <
        GUIDED_SETUP.indexOf("setInAppOnboardingActive(true);"),
    );
  });

  it("is defined ONCE, and the footer's menu item spends it", () => {
    // The Academy's setup chapter runs the same guided setup. Two copies of
    // the arming order is one copy waiting to drift, so the footer holds the
    // affordance and the hook holds the composition.
    const start = FOOTER.indexOf("onGuideMe={() => {");
    assert.ok(start >= 0, "the footer composes onGuideMe");
    assert.ok(FOOTER.includes("useRunGuidedSetup()"));
    assert.ok(FOOTER.slice(start).includes("runGuidedSetup();"));
    assert.ok(!FOOTER.includes("setInAppOnboardingFirstRun"));
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
