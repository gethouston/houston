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

  it("carries no section gate: the view mounts whatever is pinned", () => {
    // A gate hides a section's INDEX ROW (`settings-index.tsx` reads
    // `useSurfaceGates`); nothing bounces a caller out of an open screen, so
    // the view needs no tri-state loading rule and no pin to clear. Inert
    // plumbing left behind would be a second rule nobody reads.
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
 * About me is a Settings section: a standing preference about the person, kept
 * with their name and their language rather than in the rail.
 */
describe("the About me section", () => {
  const src = read("../src/components/settings/sections/about-me.tsx");

  it("reuses the ONE standing-prose editor over the `user` slot", () => {
    // The stored file does not move with the surface: this reads and writes
    // the same workspace-context slot the agents' prompt is built from.
    ok(src.includes('useContextSlot("user")'), "the user slot");
    ok(src.includes("<ContextEditorBox"), "the shared editor, not a new one");
    ok(src.includes('t("context:aboutMe.title")'), "the copy it already owned");
  });

  it("draws the COMPACT card, because the section column scrolls", () => {
    // A `fill` card claims the height its parents grant, and the Settings
    // section body grants none: it is a reading column inside the back bar's
    // own scroller, so a pinned card would collapse to nothing.
    ok(src.includes("layout={{ rows: 14 }}"), "rows mode");
    ok(!src.includes('layout="fill"'), "never the pinned page layout");
    ok(!src.includes("BackBarScreen"), "the section frame owns the back bar");
  });

  it("is mounted by the section body and listed on the index", () => {
    const body = read("../src/components/settings/settings-section-body.tsx");
    ok(body.includes('active === "aboutMe" && <AboutMeSection />'));
    const index = read("../src/components/settings/settings-index.tsx");
    ok(index.includes('onClick={() => onSelect("aboutMe")}'), "a row opens it");
    ok(index.includes('t("settings:nav.aboutMe")'), "named in Settings");
  });
});

/**
 * Workspace management is a Settings section. The Admin face frames itself, so
 * the way back rides IN its header strip; the plain workspace-name card has no
 * strip, so it keeps the shared back bar.
 */
describe("the Workspace settings section", () => {
  it("mounts Admin inside Settings, with a local fallback", () => {
    const body = read("../src/components/settings/settings-section-body.tsx");
    const section = read(
      "../src/components/settings/sections/workspace-management.tsx",
    );
    ok(body.includes('active === "workspace"'), "workspace section branch");
    ok(section.includes("<OrganizationView back={back} />"), "org is nested");
    ok(
      section.includes("<WorkspaceSection />"),
      "local workspace settings remain reachable",
    );
  });

  it("hands Admin the way back instead of stacking a bar over it", () => {
    const body = read("../src/components/settings/settings-section-body.tsx");
    ok(
      /if \(active === "workspace"\) \{\s*return <WorkspaceManagementSection back=\{back\} \/>;/.test(
        body,
      ),
      "the workspace branch mounts the section bare",
    );
    // The card face has no header strip of its own, so it is the ONE face that
    // still wears the bar — and it owns that wrapper itself.
    const section = read(
      "../src/components/settings/sections/workspace-management.tsx",
    );
    ok(
      section.includes("<BackBarScreen backLabel={back.label}"),
      "the plain card keeps the back bar",
    );
    const header = read("../src/components/organization/admin-header.tsx");
    ok(header.includes("<PageHeader back={back}>"), "Admin's strip leads back");
  });

  it("leaves no top-level Admin route", () => {
    ok(
      !read("../src/components/shell/top-level-screen-views.tsx").includes(
        "ORGANIZATION_VIEW_ID",
      ),
      "nothing mounts Admin as a top-level view",
    );
  });

  it("leaves no trace of the deleted Permissions screen", () => {
    // Agent policy is discovered through the team that owns the agent, so the
    // grid the screen framed lives on inside a team's focused agent screen
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

/**
 * Settings holds no Skills section: the shared library is the Integrations
 * screen's Skills tab (`integrations-tabs.test.ts` guards it there).
 */
describe("Settings after the Skills library left", () => {
  it("draws no Skills row and mounts no library", () => {
    const index = read("../src/components/settings/settings-index.tsx");
    ok(!index.includes("showSkills"), "no gate to read");
    ok(!index.includes('onSelect("skills")'), "no row to open it");
    ok(!index.includes("settings:nav.skills"), "no name for it");
    const body = read("../src/components/settings/settings-section-body.tsx");
    ok(!body.includes('active === "skills"'), "no section branch");
    ok(!body.includes("skills-view"), "and nothing imported from the library");
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

  it("treats a stale top-level Admin id like any other dead view", () => {
    ok(
      !src.includes('viewMode === "organization"'),
      "organization has no top-level analytics branch",
    );
  });
});

describe("use-surface-gates", () => {
  const src = read("../src/hooks/use-surface-gates.ts");

  // The rules themselves are EXECUTED in `surface-gates.test.ts`; all that is
  // left to pin here is that the hook delegates to them instead of deriving a
  // second copy that could drift.
  it("composes every gate through the pure model", () => {
    ok(src.includes("surfaceGatesFor({"), "calls the model");
    ok(
      src.includes("capabilitiesLoading: isLoading"),
      "hands it the query state `ready` is derived from",
    );
  });
});
