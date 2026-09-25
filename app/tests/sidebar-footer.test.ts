import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");
const SECTIONS = read("../src/components/shell/sidebar-nav-sections.tsx");
const ROWS = read("../src/components/shell/sidebar-nav-rows.tsx");
const NAV = `${SECTIONS}\n${ROWS}`;
const FOOTER = read("../src/components/shell/sidebar-footer.tsx");
const SHELL = read("../src/components/shell/workspace-shell.tsx");
const HELP = read("../src/components/shell/sidebar-help-menu.tsx");
const VIEWS = read("../src/lib/top-level-views.ts");
const MORE_MENU = read("../src/components/shell/mobile-more-menu.tsx");

it("makes the shell card gap a drag region only for the native Mac window", () => {
  assert.match(
    SHELL,
    /data-tauri-drag-region=\{osIsTauri\(\) && isMac \? true : undefined\}\s+className="relative flex min-w-0 flex-1 gap-0 overflow-hidden md:gap-2"/,
  );
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
    // "Report a problem" is what a stuck user reaches for, and it is not a
    // destination, so it is a menu item on a control next to the gear rather
    // than a row among the app's screens. The guided tour is an Academy lesson.
    assert.ok(FOOTER.includes("<SidebarHelpMenu"));
    assert.ok(FOOTER.includes("collapsed={props.collapsed}"));
    assert.ok(FOOTER.includes('help: t("sidebar.help")'));
    assert.ok(!FOOTER.includes("guideMe"));
    assert.ok(FOOTER.includes('reportProblem: t("sidebar.reportProblem")'));
    // Report a problem opens the ONE bug-report surface rather than a second
    // copy of it.
    assert.ok(FOOTER.includes('openSettings("reportBug")'));
  });

  it("is the rail's last row", () => {
    // The account avatar expanded into "Account settings", which opened THIS
    // row's destination — a second door onto one page. Identity moved into the
    // Settings index (`settings/identity-header.tsx`), so nothing about a user
    // menu may survive in the footer.
    assert.ok(!FOOTER.includes("UserMenu"));
    assert.ok(!FOOTER.includes("user-menu"));
  });

  it("places the update action before the Academy and Settings cluster", () => {
    assert.ok(FOOTER.includes("<UpdateChecker collapsed={props.collapsed} />"));
    assert.ok(
      FOOTER.indexOf("<UpdateChecker") < FOOTER.indexOf("<SidebarNavItem"),
      "the update action precedes the Academy and Settings cluster",
    );
  });
});

describe("the help menu", () => {
  it("offers no guided tour of its own, and no tour anchor", () => {
    // The tour lives in the Academy, so nothing on the rail replays it.
    assert.ok(!HELP.includes("onGuideMe"));
    assert.ok(!HELP.includes('tourAnchor("appTour")'));
    assert.ok(!NAV.includes('tourAnchor("appTour")'));
  });

  it("runs Report a problem one tick AFTER the menu closes", () => {
    // Radix restores focus to the trigger when its content unmounts, which
    // lands after a synchronous handler has already moved the view. The band's
    // create menu defers for the same reason.
    assert.ok(HELP.includes("onSelect={() => setTimeout(onReportProblem, 0)}"));
  });
});
