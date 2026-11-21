import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the skill-setup notification", () => {
  const src = read("../src/hooks/session-notification-navigate.ts");

  it("lands on the employee's Skills section, arming the chat once there", () => {
    ok(src.includes('openAgentSettings(agent.id, "skills", {'), "opens it");
    ok(src.includes("onOpened: () =>"));
    ok(src.includes("setPendingSkillChatActivityId(target.activityId)"));
    ok(
      src.includes("canOpenAgentSettings(capabilities, agent)"),
      "only for someone who may open that employee's settings",
    );
  });

  it("stays put only when that employee's Skills section is on screen", () => {
    ok(src.includes("shown?.agentId === agent.id"));
    ok(src.includes('shown.section === "skills"'));
    const pane = read("../src/components/team-view/agent-settings-pane.tsx");
    ok(pane.includes("onSectionShown={"), "the pane reports what it shows");
  });
});

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
