import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_INTEGRATIONS_TAB,
  integrationsTabIds,
} from "../src/components/integrations-view/integrations-view-model.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("integrationsTabIds", () => {
  it("lands on the catalog, which the identity lozenge stands for", () => {
    deepStrictEqual(DEFAULT_INTEGRATIONS_TAB, "catalog");
    deepStrictEqual(integrationsTabIds({ showSkills: true })[0], "catalog");
  });

  it("adds Skills only for the caller who holds the space", () => {
    deepStrictEqual(
      [...integrationsTabIds({ showSkills: true })],
      ["catalog", "skills"],
    );
    deepStrictEqual(
      [...integrationsTabIds({ showSkills: false })],
      ["catalog"],
    );
  });
});

/**
 * The Skills library is the Integrations screen's second tab. The node runner
 * has no DOM, so the wiring is guarded on source (the repo's React-test idiom).
 */
describe("the Integrations tab cluster", () => {
  const view = read(
    "../src/components/integrations-view/integrations-view.tsx",
  );
  const header = read(
    "../src/components/integrations-view/integrations-header.tsx",
  );

  it("spans both tabs with ONE tools provider, one body at a time", () => {
    // Both bodies portal their search and actions into the same strip, so only
    // one may be mounted: two live `PageHeaderTools` would fight over it.
    ok(
      view.includes("<PageHeaderToolsProvider thresholds={"),
      "one provider around the whole screen",
    );
    ok(
      /tab === "skills" && showSkills \? \(\s*<SkillsBody/.test(view),
      "the Skills body replaces the catalog rather than joining it",
    );
  });

  it("hands the tab cluster to the library, which the editor replaces", () => {
    // Opening a skill takes the WHOLE screen: the editor brings its own strip,
    // so the list wears the tab cluster and the editor wears nothing of it.
    ok(view.includes("<SkillsBody listHeader={header} />"), "the list's strip");
    const body = read("../src/components/skills-view/skills-view.tsx");
    ok(body.includes("{listHeader}"), "drawn over the list only");
    ok(
      !/<SkillEditorPage[^>]*listHeader/.test(body),
      "never over the editor, which carries its own back",
    );
  });

  it("collapses into a switcher only when there is something to switch", () => {
    ok(
      header.includes("usePageHeaderTabsCollapsed() && visibleIds.length > 1"),
      "a lone lozenge stays a static heading",
    );
    ok(header.includes("<PageHeaderSwitcher"), "the collapsed form exists");
    ok(
      header.includes('"data-integrations-tab": id'),
      "both forms carry the tab marker the specs address",
    );
  });

  it("falls back to the catalog when the gate closes under the open tab", () => {
    ok(
      view.includes(
        "if (!visibleIds.includes(tab)) requestTab(DEFAULT_INTEGRATIONS_TAB)",
      ),
      "an effect on the visible set, not a mount-time choice",
    );
  });

  it("sends the skill-setup notification to the Skills tab", () => {
    // The setup chat's home moved with the library: the notification must open
    // the tab, and must leave a user already standing on it alone.
    const src = read("../src/hooks/session-notification-navigate.ts");
    ok(
      src.includes("setViewMode(INTEGRATIONS_VIEW_ID)") &&
        src.includes('nav.requestTab("skills")'),
      "opens the screen on the tab",
    );
    ok(
      src.includes(
        'prevViewMode === INTEGRATIONS_VIEW_ID && nav.tab === "skills"',
      ),
      "the already-there check reads both halves of the location",
    );
    ok(
      src.includes("setPendingSkillChatActivityId(target.activityId)"),
      "the chat to reopen still rides along",
    );
    // The custom-integration setup chat is hosted by the CATALOG body, so that
    // branch has to name its tab too or the chat opens onto an unmounted host.
    ok(src.includes('nav.requestTab("catalog")'), "and the catalog branch too");
  });
});
