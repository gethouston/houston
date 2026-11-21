import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { ACADEMY_VIEW_ID } from "../src/components/academy/id.ts";
import {
  ABOUT_ME_VIEW_ID,
  PROFILE_VIEW_ID,
} from "../src/components/account/id.ts";
import { AGENTS_HOME_VIEW_ID } from "../src/components/agents-home/id.ts";
import { ASSISTANT_VIEW_ID } from "../src/components/assistant/id.ts";
import { INTEGRATIONS_VIEW_ID } from "../src/components/integrations-view/id.ts";
import { ADMIN_VIEW_ID } from "../src/components/organization/id.ts";
import { SETTINGS_SECTION_IDS } from "../src/lib/settings-sections.ts";
import type { TeamSectionId } from "../src/lib/teams-model.ts";
import {
  resolveTeamSection,
  visibleAgentSections,
} from "../src/lib/teams-model.ts";
import {
  AGENT_VIEW_ID,
  AI_HUB_VIEW_ID,
  blockedTopLevelView,
  isActiveTopLevelView,
  isMissionBoardSurface,
  isMissionBoardView,
  isTopLevelView,
  SETTINGS_VIEW_ID,
  TOP_LEVEL_VIEWS,
} from "../src/lib/top-level-views.ts";

describe("isTopLevelView", () => {
  it("recognizes the top-level views", () => {
    for (const id of [
      ASSISTANT_VIEW_ID,
      ACADEMY_VIEW_ID,
      AGENTS_HOME_VIEW_ID,
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      INTEGRATIONS_VIEW_ID,
      ADMIN_VIEW_ID,
      PROFILE_VIEW_ID,
      ABOUT_ME_VIEW_ID,
      AGENT_VIEW_ID,
    ]) {
      strictEqual(isTopLevelView(id), true, id);
    }
  });

  it("is exactly those ten, and no settings section doubles as one", () => {
    strictEqual(TOP_LEVEL_VIEWS.size, 10);
    for (const section of SETTINGS_SECTION_IDS) {
      strictEqual(isTopLevelView(section), false, section);
    }
    for (const retired of [
      "usage",
      "permissions",
      "time-worked",
      "inbox",
      "agent-store",
      "organization",
      "teams-home",
      "skills-home",
    ]) {
      strictEqual(isTopLevelView(retired), false, retired);
    }
  });

  it("treats everything else as an agent tab", () => {
    strictEqual(isTopLevelView("chat"), false);
    strictEqual(isTopLevelView("integrations"), false);
    strictEqual(isTopLevelView("skills"), false);
  });
});

describe("isMissionBoardView", () => {
  it("covers every employee's board, the only boards left", () => {
    strictEqual(isMissionBoardView(AGENT_VIEW_ID), true);
  });

  it("no longer covers a global board, because there is none", () => {
    strictEqual(isMissionBoardView("dashboard"), false);
    strictEqual(isMissionBoardView(AGENTS_HOME_VIEW_ID), false);
  });

  it("covers nothing else", () => {
    for (const id of [SETTINGS_VIEW_ID, AI_HUB_VIEW_ID, "activity", "chat"]) {
      strictEqual(isMissionBoardView(id), false, id);
    }
  });
});

describe("isMissionBoardSurface", () => {
  it("is never a board off the employee screen, whatever the stale section says", () => {
    for (const agentSection of [
      null,
      "mission-control",
      "routines",
      "files",
      "settings",
    ] as const) {
      strictEqual(
        isMissionBoardSurface({ viewMode: AGENTS_HOME_VIEW_ID, agentSection }),
        false,
        `${agentSection}`,
      );
    }
  });

  it("is a board on an employee whose open section is Mission Control", () => {
    strictEqual(
      isMissionBoardSurface({
        viewMode: AGENT_VIEW_ID,
        agentSection: "mission-control",
      }),
      true,
    );
  });

  it("is a board on an employee with no section chosen yet", () => {
    strictEqual(
      isMissionBoardSurface({ viewMode: AGENT_VIEW_ID, agentSection: null }),
      true,
    );
  });

  it("agrees with resolveTeamSection on what a null section renders", () => {
    strictEqual(
      resolveTeamSection(visibleAgentSections(null, {}), null),
      "mission-control",
    );
  });

  it("is NOT a board on an employee's Routines, Files or Settings", () => {
    for (const agentSection of [
      "routines",
      "files",
      "settings",
    ] satisfies TeamSectionId[]) {
      strictEqual(
        isMissionBoardSurface({ viewMode: AGENT_VIEW_ID, agentSection }),
        false,
        agentSection,
      );
    }
  });

  it("is NOT a board on any other view", () => {
    for (const viewMode of [
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      INTEGRATIONS_VIEW_ID,
      "activity",
      "chat",
    ]) {
      strictEqual(
        isMissionBoardSurface({ viewMode, agentSection: "mission-control" }),
        false,
        viewMode,
      );
    }
  });
});

describe("isActiveTopLevelView", () => {
  it("only enables work for the visible top-level screen", () => {
    strictEqual(isActiveTopLevelView(SETTINGS_VIEW_ID, SETTINGS_VIEW_ID), true);
    strictEqual(
      isActiveTopLevelView(AGENTS_HOME_VIEW_ID, SETTINGS_VIEW_ID),
      false,
    );
  });

  it("keeps AI Models' read on its own screen", () => {
    strictEqual(isActiveTopLevelView(SETTINGS_VIEW_ID, AI_HUB_VIEW_ID), false);
  });
});

describe("blockedTopLevelView", () => {
  const gates = (
    over: {
      showAiModels?: boolean;
      showAssistant?: boolean;
      showOrganization?: boolean;
    } = {},
  ) => ({
    showAiModels: over.showAiModels ?? false,
    showAssistant: over.showAssistant ?? false,
    showOrganization: over.showOrganization ?? false,
  });

  it("never blocks the Integrations page", () => {
    strictEqual(blockedTopLevelView(INTEGRATIONS_VIEW_ID, gates()), false);
  });

  it("blocks a stale AI Models hub when its gate is off", () => {
    strictEqual(blockedTopLevelView(AI_HUB_VIEW_ID, gates()), true);
    strictEqual(
      blockedTopLevelView(AI_HUB_VIEW_ID, gates({ showAiModels: true })),
      false,
    );
  });

  it("blocks Admin when the organization gate is closed", () => {
    strictEqual(blockedTopLevelView(ADMIN_VIEW_ID, gates()), true);
    strictEqual(
      blockedTopLevelView(ADMIN_VIEW_ID, gates({ showOrganization: true })),
      false,
    );
  });

  it("blocks the assistant where discovery hands out no address", () => {
    strictEqual(blockedTopLevelView(ASSISTANT_VIEW_ID, gates()), true);
    strictEqual(
      blockedTopLevelView(ASSISTANT_VIEW_ID, gates({ showAssistant: true })),
      false,
    );
  });

  it("never blocks the Academy: learning the product is everyone's", () => {
    strictEqual(blockedTopLevelView(ACADEMY_VIEW_ID, gates()), false);
  });

  it("never blocks ungated top-level views or agent tabs", () => {
    for (const id of [
      ACADEMY_VIEW_ID,
      PROFILE_VIEW_ID,
      ABOUT_ME_VIEW_ID,
      AGENTS_HOME_VIEW_ID,
      SETTINGS_VIEW_ID,
      AGENT_VIEW_ID,
      "chat",
    ]) {
      strictEqual(blockedTopLevelView(id, gates()), false, id);
    }
  });
});
