import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * The node runner has no DOM, so the view's wiring is guarded on its source
 * (the repo's React-test idiom). Each assertion below stands for a bug that
 * shipped once: one navigation emitting two analytics events, and a scroll
 * gutter that shifted the page sideways on drill-in.
 */
describe("settings-view source", () => {
  const src = read("../src/components/settings/settings-view.tsx");

  it("carries no section gate: every remaining section is ungated", () => {
    // Admin and Permissions are top-level views again, which took the last
    // gated section with them. Inert plumbing left behind would be a second
    // rule nobody reads.
    ok(!src.includes("settingsSectionGate"), "no tri-state gate");
    ok(!src.includes("blockedSettingsSection"), "no raw gate");
    ok(!src.includes("clearSettingsSectionPin"), "no one-shot pin to clear");
    ok(!src.includes("useSurfaceGates"), "reads no surface gate at all");
  });

  it("puts every section behind the ONE workspace gate", () => {
    // No section opts out any more: the two that read org/billing instead of
    // `GET /v1/workspaces` are not sections.
    ok(
      !src.includes("settingsSectionNeedsWorkspace"),
      "no per-section workspace opt-out",
    );
    ok(src.includes('if (gate === "loading")'), "one workspace spinner");
    ok(src.includes('if (gate !== "ready")'), "one workspace error frame");
  });

  it("emits one truthful tab_opened per surface reached", () => {
    ok(src.includes('? "settings"'), "the index is keyed `settings`");
    ok(src.includes("`settings:"), "a section is keyed `settings:<id>`");
    ok(
      src.includes("lastReached.current === reached") &&
        src.includes("lastReached.current = reached"),
      "emits once per open, not once per render",
    );
    ok(
      /const reached =\s*gate !== "ready"\s*\? null/.test(src),
      "a loading or error frame emits nothing",
    );
  });

  it("matches the sections' scroll gutter on the index scroller", () => {
    // Every section screen reserves the gutter (`back-bar-screen.tsx`), so the
    // index must too or content shifts sideways on drill-in/out.
    ok(
      src.includes(
        'className="flex-1 overflow-y-auto [scrollbar-gutter:stable]"',
      ),
      "index scroller reserves the scrollbar gutter",
    );
    ok(
      read("../src/components/shell/back-bar-screen.tsx").includes(
        "[scrollbar-gutter:stable]",
      ),
      "the section frame it must match still reserves it",
    );
  });
});

/**
 * The promoted screens own the whole window, so neither may wrap itself in a
 * back bar at its top level — the only bar left on each page is the one its own
 * drill-in renders (an Admin section detail; About me has no drill-in at all).
 */
describe("the promoted top-level screens", () => {
  it("Admin takes no back-bar props and frames its index itself", () => {
    const src = read("../src/components/organization/organization-view.tsx");
    ok(src.includes("export function OrganizationView() {"), "no props");
    ok(!src.includes("backLabel={backLabel}"), "no caller-owned back bar");
    ok(
      src.includes("[scrollbar-gutter:stable]"),
      "its index scroller reserves the gutter",
    );
  });

  it("About me takes no back-bar props and frames itself", () => {
    // It was a drill-in behind a door in the Inbox's masthead, so the back bar
    // it wore then would now be a bar pointing at a level that no longer
    // exists above it.
    const src = read("../src/components/about-me/about-me-view.tsx");
    ok(src.includes("export function AboutMeView() {"), "no props");
    ok(!src.includes("BackBarScreen"), "no back bar at a top level");
    ok(
      src.includes("[scrollbar-gutter:stable]"),
      "its scroller reserves the gutter",
    );
  });

  it("keeps Admin's section detail back bar", () => {
    ok(
      read("../src/components/organization/organization-view.tsx").includes(
        "BackBarScreen",
      ),
      "the section detail still returns to the Admin index",
    );
  });

  it("leaves no trace of the deleted Permissions screen", () => {
    // Agent policy is discovered through the team that owns the agent, so the
    // grid the screen framed lives on inside a team's Manage agents section
    // while the screen, its id and its barrel are gone.
    const views = read("../src/lib/top-level-views.ts");
    ok(!views.includes("PERMISSIONS_VIEW_ID"), "no view id");
    ok(!views.includes("TIME_WORKED_VIEW_ID"), "no Time worked view id either");
    ok(
      !read("../src/components/shell/top-level-screen-views.tsx").includes(
        "PermissionsView",
      ),
      "nothing mounts it",
    );
  });
});

describe("workspace-shell analytics", () => {
  const src = read("../src/components/shell/use-workspace-view-guards.ts");

  it("leaves the settings tab_opened event to SettingsView", () => {
    ok(
      src.includes('if (viewMode === "settings") return;'),
      "the generic viewMode effect skips settings",
    );
  });

  it("owns the ONE top-level event for Admin", () => {
    // Admin tracks only its DRILL-IN (`org:<section>`), so the generic effect
    // must NOT skip it or landing on the screen would record nothing at all.
    ok(
      !src.includes('viewMode === "organization"'),
      "organization not skipped",
    );
  });

  it("makes the Settings tour step ONE promise, for every caller", () => {
    // The team-shaped variant promised admin, permissions and time worked
    // "live here". Admin is a rail row of its own, Time worked is a lens inside
    // it and Permissions is gone, so the second body had nothing true left to
    // say and the gate that chose it went with it.
    const tour = read("../src/components/shell/workspace-tour.ts");
    ok(!tour.includes("showOrganization"), "no org gate left in the tour");
    ok(!tour.includes("bodyTeam"), "no second body");
    ok(
      tour.includes('t("shell:uiTour.steps.settings.body")'),
      "one body, for everyone",
    );
  });
});

describe("use-surface-gates", () => {
  const src = read("../src/hooks/use-surface-gates.ts");

  it("exposes whether the gates have resolved", () => {
    ok(src.includes("ready: !isLoading"), "derives ready from the query state");
  });
});
