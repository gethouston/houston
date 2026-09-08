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
const FOOTER = read("../src/components/shell/sidebar-footer.tsx");
const SHELL = read("../src/components/shell/workspace-shell.tsx");
const HELP = read("../src/components/shell/sidebar-help-menu.tsx");
const GUIDED_SETUP = read("../src/hooks/use-run-guided-setup.ts");
const VIEWS = read("../src/lib/top-level-views.ts");
const SETTINGS_SECTIONS = read("../src/lib/settings-sections.ts");
/** The phone's long tail, which mirrors the rail's footer cluster. */
const MORE_MENU = read("../src/components/shell/mobile-more-menu.tsx");

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

describe("the rail's unlabelled run", () => {
  const primary = navSection("primary");

  it("is the Assistant then the Agent store, and nothing else", () => {
    assert.ok(
      primary.indexOf("id: STORE_VIEW_ID,") >= 0,
      "the Agent store row is declared",
    );
    assert.equal(
      primary.match(/\n {10}id: /g)?.length,
      1,
      "the run declares exactly one unconditional row inline",
    );
  });

  it("is led by the Assistant, on the one gate that is not a role", () => {
    // Discovery, not a role: a deployment that serves no assistant has no
    // address to open a chat at, so the row must not exist there. It leads the
    // run, ahead of the Agent store, and it is the run's ONLY gated row.
    assert.deepEqual(gatedRuns(primary), [["showAssistant", "assistant"]]);
    assert.ok(
      primary.indexOf("showAssistant ?") < primary.indexOf("id: STORE_VIEW_ID"),
      "it leads the run",
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

describe("the rail's footer cluster", () => {
  it("draws the Academy directly above Settings", () => {
    // The bottom of the rail is what a person opens about their own use of
    // Houston: learning to fly, then their preferences. Both are ungated, and
    // the Academy must come first in the source so it renders above the gear.
    assert.ok(FOOTER.includes("academyNavRow("), "built from the shared row");
    assert.ok(FOOTER.includes('label: t("sidebar.academy")'));
    assert.ok(FOOTER.includes("active={viewMode === ACADEMY_VIEW_ID}"));
    assert.ok(
      FOOTER.indexOf("ACADEMY_VIEW_ID)") <
        FOOTER.indexOf("active={viewMode === SETTINGS_VIEW_ID}"),
      "the Academy row is drawn before the Settings row",
    );
    assert.ok(VIEWS.includes("ACADEMY_VIEW_ID"), "a real top-level view");
  });

  it("is ONE row, shared with the phone's More menu", () => {
    // Two breakpoints, one destination: the menu spends the same builder, so
    // the label, the glyph and the view id cannot drift apart.
    assert.ok(ROWS.includes("export function academyNavRow("));
    assert.ok(MORE_MENU.includes("academyNavRow("));
    assert.ok(MORE_MENU.includes('label: t("shell:sidebar.academy")'));
    // A menu destination is a tab-level move on the phone, never a level
    // pushed onto the tree the user was standing in.
    assert.ok(
      MORE_MENU.includes('setViewMode(ACADEMY_VIEW_ID, { nav: "reset" })'),
    );
    assert.ok(MORE_MENU.includes("<MobileMoreRowButton row={academy} />"));
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
