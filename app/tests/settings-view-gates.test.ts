import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminViewEnabled } from "../src/components/shell/top-level-screen-plan.ts";
import {
  parseSettingsSection,
  SETTINGS_SECTION_IDS,
} from "../src/lib/settings-sections.ts";

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

  it("keeps Admin out of the Settings index", () => {
    const sections = new Set<string>(SETTINGS_SECTION_IDS);
    ok(!sections.has("admin"));
    ok(!sections.has("organization"));
    ok(!sections.has("workspace"));
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

describe("the Admin screen", () => {
  it("keeps Admin mounted pending its gate, then admits or removes it", () => {
    strictEqual(
      adminViewEnabled({ showOrganization: false, ready: false }),
      true,
    );
    strictEqual(
      adminViewEnabled({ showOrganization: false, ready: true }),
      false,
    );
    strictEqual(
      adminViewEnabled({ showOrganization: true, ready: true }),
      true,
    );
  });

  it("has no Settings section", () => {
    strictEqual(parseSettingsSection("workspace"), null);
    strictEqual(parseSettingsSection("organization"), null);
    strictEqual(parseSettingsSection("admin"), null);
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
