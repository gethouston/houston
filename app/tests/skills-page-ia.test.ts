import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * The shared Skills library is a SCREEN, reached from its own rail row. The
 * node runner has no DOM, so the wiring is guarded on source (the repo's
 * React-test idiom).
 */
describe("the Skills page", () => {
  const page = read("../src/components/skills-view/skills-page.tsx");
  const views = read("../src/components/shell/top-level-screen-views.tsx");

  it("frames the library with ONE tools provider around header and body", () => {
    // The body portals its search and "Create skill" into the strip, so the
    // provider has to span both or the tools have nowhere to land.
    ok(
      page.includes("<PageHeaderToolsProvider thresholds={"),
      "one provider around the whole screen",
    );
    ok(page.includes("<SkillsBody listHeader={<SkillsHeader />} />"));
  });

  it("titles itself with the library's own page title", () => {
    ok(page.includes('t("global.pageTitle")'));
    ok(page.includes("heading: true"), "the lozenge carries the screen's h1");
  });

  it("hands the strip to the LIST, which the editor replaces", () => {
    // Opening a skill takes the WHOLE screen: the editor brings its own strip,
    // so the list wears the header and the editor wears nothing of it.
    const body = read("../src/components/skills-view/skills-view.tsx");
    ok(body.includes("{listHeader}"), "drawn over the list only");
    ok(
      !/<SkillEditorPage[^>]*listHeader/.test(body),
      "never over the editor, which carries its own back",
    );
  });

  it("mounts only where the space-owner gate is open", () => {
    ok(views.includes("enabled: gates.showSkills"));
    ok(views.includes("content: <SkillsPage />"));
  });

  it("sends the skill-setup notification to the Skills screen", () => {
    // The setup chat's home is the library, and a user already standing on it
    // is never yanked elsewhere (a bare macOS refocus lands here too).
    const src = read("../src/hooks/session-notification-navigate.ts");
    ok(src.includes("setViewMode(SKILLS_VIEW_ID)"), "opens the screen");
    ok(
      src.includes("prevViewMode === SKILLS_VIEW_ID"),
      "the already-there check reads the location",
    );
    ok(
      src.includes("setPendingSkillChatActivityId(target.activityId)"),
      "the chat to reopen still rides along",
    );
  });
});

/**
 * The Integrations screen is the apps catalog and nothing else: the library
 * left it for a row of its own, so no tab cluster, no tab store, no gate.
 */
describe("the Integrations screen", () => {
  const view = read(
    "../src/components/integrations-view/integrations-view.tsx",
  );
  const header = read(
    "../src/components/integrations-view/integrations-header.tsx",
  );

  it("draws one static heading lozenge, never a switcher", () => {
    ok(header.includes("heading: true"), "the identity carries the h1");
    ok(!header.includes("PageHeaderSwitcher"), "nothing to switch");
    ok(!header.includes("usePageHeaderTabsCollapsed"));
    ok(
      header.includes('"data-integrations-tab": "catalog"'),
      "the marker the specs address",
    );
  });

  it("holds no tab state and no Skills body", () => {
    ok(!view.includes("SkillsBody"));
    ok(!view.includes("useIntegrationsNav"));
    ok(!view.includes("useSurfaceGates"));
    ok(!view.includes("integrationsTabIds"));
  });
});
