import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("sidebar review wiring", () => {
  it("does not expose folder writes before the sidebar read succeeds", () => {
    const sidebar = source("components/shell/sidebar.tsx");
    const rail = source("components/shell/sidebar-rail.tsx");
    const menu = source("components/shell/team-folder-menu.tsx");
    assert.match(sidebar, /ready: sidebar\.ready/);
    assert.match(rail, /onArrange=\{ready \? onArrange : undefined\}/);
    assert.match(sidebar, /onArrange: sidebar\.arrange/);
    assert.equal(
      existsSync(
        new URL("../src/components/shell/use-team-actions.ts", import.meta.url),
      ),
      false,
    );
    assert.match(menu, /disabled=\{!sidebar\.ready\}/);
  });

  it("keeps the folder move dialog mounted above the rail", () => {
    const app = source("app-workspace.tsx");
    const menu = source("components/shell/team-folder-menu.tsx");
    assert.match(app, /<TeamMoveHost \/>/);
    assert.match(menu, /openTeamMove\(/);
    assert.doesNotMatch(menu, /<TeamMoveFlow/);
  });

  it("reports corrupt pending folder moves during agent move resume", () => {
    const resume = source("hooks/use-move-resume.ts");
    assert.match(resume, /readPendingTeamMoves\(undefined, \(error\) =>/);
    assert.match(
      resume,
      /logAndReportError\("read_pending_team_moves", error\)/,
    );
  });
  it("settles the workspace id after a failed roster read", () => {
    const store = source("stores/agents-loading.ts");
    assert.match(
      store,
      /catch \(error\) \{[\s\S]*?set\(\(state\) => \(\{[\s\S]*?loadedWorkspaceId: workspaceId[\s\S]*?\}\)\)/,
    );
  });

  it("holds org chart and the phone's New group until the layout settles", () => {
    const chart = source("components/organization/org-chart-tab.tsx");
    const home = source("components/agents-home/agents-home-header.tsx");
    assert.match(chart, /useSidebarLayoutLoaded\(workspaceId\)/);
    assert.match(chart, /!layoutReady/);
    assert.match(home, /disabled=\{!sidebar\.ready\}/);
  });

  it("creates a named folder with one write", () => {
    const form = source("components/shell/use-create-team-form.ts");
    // `new-group-submit.test.ts` pins the single identity-carrying write.
    assert.match(form, /submitNewGroup\(\s*\{ name, icon, color \}/);
    assert.match(form, /createGroup: sidebar\.createGroup/);
    assert.doesNotMatch(form, /sidebar\.setGroupIdentity/);
  });

  it("routes a hands-on errand without a current agent", () => {
    const navigation = source("lib/hands-on-navigation.ts");
    assert.match(navigation, /currentWorkingAgentId\(\)/);
    assert.match(navigation, /openHome\(/);
    assert.doesNotMatch(navigation, /if \(!currentAgent\) return/);
  });

  it("shows the inline generic agent creation failure", () => {
    const creation = source("components/shell/use-create-blank-agent.ts");
    // The create's own `call("create_agent")` reports the failure once; the
    // hook only shows the inline copy.
    assert.match(
      creation,
      /kind: "failed",\s*message: t\("agentOnboarding:roleSetup\.createFailed"\)/,
    );
    assert.match(
      source("lib/tauri.ts"),
      /call<CreateAgentResult>\(\s*"create_agent"/,
    );
  });

  it("moves an agent between groups synchronously, with nothing to await", () => {
    const hook = source("components/team-view/use-move-agent-team.ts");
    assert.doesNotMatch(hook, /async|Promise/);
    for (const caller of [
      "components/agents-home/agent-missions-move.tsx",
      "components/agent-settings/agent-settings-manage.tsx",
      "components/agent-actions/use-copy-agent.ts",
    ]) {
      assert.doesNotMatch(source(caller), /(void|await) moveAgent\(/, caller);
    }
  });

  it("reads the sidebar layout through one query config", () => {
    const hook = source("hooks/use-sidebar-layout.ts");
    assert.equal(hook.match(/queryFn:/g)?.length, 1);
  });

  it("takes the layout normalizer straight from the protocol", () => {
    assert.match(
      source("lib/sidebar-layout-ops.ts"),
      /normalizeSidebarLayout,\n\} from "@houston\/protocol";/,
    );
    assert.equal(
      existsSync(
        new URL("../src/lib/sidebar-layout-normalize.ts", import.meta.url),
      ),
      false,
    );
  });

  it("routes failures the adapter absorbs into the app's reporting path", () => {
    const handlers = source("lib/global-error-handlers.ts");
    assert.match(handlers, /setAdapterErrorSink\(logAndReportError\)/);
  });
});
