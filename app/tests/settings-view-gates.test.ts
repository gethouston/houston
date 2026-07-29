import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { useOrgNav } from "../src/components/organization/org-nav-store.ts";
import { usePermissionsNav } from "../src/components/permissions/permissions-nav-store.ts";
import { clearSettingsSectionPin } from "../src/components/settings/settings-nav-pins.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

afterEach(() => {
  usePermissionsNav.getState().clearRequested();
  useOrgNav.getState().clearRequestedTab();
});

/**
 * The one-shot deep-link pins are set by the CALLER, right before it opens the
 * section, and consumed by the section on render. A section that never renders
 * (the blocked fallback drops it) leaves its pin behind for the whole session,
 * so the next legitimate open drills into a stale agent / tab.
 */
describe("clearSettingsSectionPin", () => {
  it("drops the Permissions agent pin when Permissions is the dropped section", () => {
    usePermissionsNav.getState().requestAgentDetail("agent-1", "integrations");

    clearSettingsSectionPin("permissions");

    strictEqual(usePermissionsNav.getState().requestedAgentId, null);
    strictEqual(usePermissionsNav.getState().requestedAgentTab, null);
  });

  it("drops the Admin tab pin when Admin is the dropped section", () => {
    useOrgNav.getState().requestTab("billing");

    clearSettingsSectionPin("organization");

    strictEqual(useOrgNav.getState().requestedTab, null);
  });

  it("touches no pin for a section that owns none", () => {
    usePermissionsNav.getState().requestAgentDetail("agent-1");
    useOrgNav.getState().requestTab("billing");

    clearSettingsSectionPin("timeWorked");
    clearSettingsSectionPin("profile");

    strictEqual(usePermissionsNav.getState().requestedAgentId, "agent-1");
    strictEqual(useOrgNav.getState().requestedTab, "billing");
  });
});

/**
 * The node runner has no DOM, so the view's wiring is guarded on its source
 * (the repo's React-test idiom). Each assertion below stands for a bug that
 * shipped once: a gate decided while loading, a workspace gate blocked a
 * surface that never read the workspace list, and one navigation emitted two
 * analytics events.
 */
describe("settings-view source", () => {
  const src = read("../src/components/settings/settings-view.tsx");

  it("defers BOTH the decision and the fallback to the resolved gates", () => {
    ok(src.includes("settingsSectionGate("), "routes through the tri-state");
    ok(
      !src.includes("blockedSettingsSection"),
      "never decides on the raw gate",
    );
    ok(
      src.includes('sectionGate !== "blocked"'),
      "the fallback effect fires only on a RESOLVED block",
    );
    ok(
      src.includes('sectionGate === "loading"'),
      "shows a loading frame while the gates are in flight",
    );
  });

  it("clears the dropped section's one-shot pin in the fallback", () => {
    ok(src.includes("clearSettingsSectionPin(active)"), "clears the pin");
  });

  it("bypasses the workspace gate for the moved surfaces", () => {
    ok(
      src.includes("settingsSectionNeedsWorkspace(visible)"),
      "asks whether this section needs a workspace",
    );
    ok(
      src.includes('needsWorkspace && gate === "loading"'),
      "the workspace spinner is conditional",
    );
    ok(
      src.includes('needsWorkspace && gate !== "ready"'),
      "the workspace error frame is conditional",
    );
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
      src.includes('sectionGate === "loading" ||'),
      "a loading frame emits nothing",
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

describe("workspace-shell analytics", () => {
  const src = read("../src/components/shell/workspace-shell.tsx");

  it("leaves the settings tab_opened event to SettingsView", () => {
    ok(
      src.includes('if (viewMode === "settings") return;'),
      "the generic viewMode effect skips settings",
    );
  });

  it("picks the Settings tour copy from the org gate", () => {
    ok(src.includes("showOrganization"), "reads the org gate in the shell");
    ok(
      src.includes('t("shell:uiTour.steps.settings.bodyTeam")') &&
        src.includes('t("shell:uiTour.steps.settings.body")'),
      "two bodies, chosen by the gate",
    );
  });
});

describe("use-surface-gates", () => {
  const src = read("../src/hooks/use-surface-gates.ts");

  it("exposes whether the gates have resolved", () => {
    ok(src.includes("ready: !isLoading"), "derives ready from the query state");
  });
});
