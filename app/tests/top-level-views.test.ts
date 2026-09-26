import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { ACADEMY_VIEW_ID } from "../src/components/academy/id.ts";
import { AGENTS_HOME_VIEW_ID } from "../src/components/agents-home/id.ts";
import { ASSISTANT_VIEW_ID } from "../src/components/assistant/id.ts";
import { INTEGRATIONS_VIEW_ID } from "../src/components/integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../src/components/skills-view/id.ts";
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
      // The personal assistant's screen, gated on discovery rather than a role.
      ASSISTANT_VIEW_ID,
      ACADEMY_VIEW_ID,
      // The phone's AI Employees tab root.
      AGENTS_HOME_VIEW_ID,
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      INTEGRATIONS_VIEW_ID,
      // The shared Skills library, beside Integrations in the rail.
      SKILLS_VIEW_ID,
      // One screen for every team: which team is open is store state, not an id.
      AGENT_VIEW_ID,
    ]) {
      strictEqual(isTopLevelView(id), true, id);
    }
  });

  it("is exactly those eight, and no settings section doubles as one", () => {
    // A Settings section is reached THROUGH `settings`, so no section id may
    // also resolve as a top-level view. Checking the live section list (rather
    // than retired string literals) keeps this failing if a future section is
    // wired up as a top-level view by mistake, and still covers the
    // stale-persisted-`viewMode` case that motivated it.
    strictEqual(TOP_LEVEL_VIEWS.size, 8);
    for (const section of SETTINGS_SECTION_IDS) {
      strictEqual(isTopLevelView(section), false, section);
    }
    // Retired `viewMode` values an older install may still have pinned: the
    // global usage page, the Permissions screen (agent policy is a team's
    // focused agent screen), the standalone Time worked screen (a lens inside
    // Admin), the Inbox, About me (a Settings section), and the phone's groups
    // tree (groups are managed from the AI Employees list).
    for (const retired of [
      "usage",
      "permissions",
      "time-worked",
      "inbox",
      "about-me",
      "agent-store",
      "organization",
      "teams-home",
    ]) {
      strictEqual(isTopLevelView(retired), false, retired);
    }
  });

  it("treats everything else as an agent tab", () => {
    strictEqual(isTopLevelView("chat"), false);
    strictEqual(isTopLevelView("integrations"), false);
    // "skills" is the per-agent settings page's Skills SECTION id, which is
    // why the library's view id is `skills-home` instead.
    strictEqual(isTopLevelView("skills"), false);
  });
});

describe("isMissionBoardView", () => {
  it("covers every employee's board, the only boards left", () => {
    // The employee screen owns the global "New mission" handler while its board is
    // mounted, so ⌘N and the palette fire it in place instead of navigating.
    strictEqual(isMissionBoardView(AGENT_VIEW_ID), true);
  });

  it("no longer covers a global board, because there is none", () => {
    // The general Mission Control is deleted. Its id must not linger as a
    // board: it would claim ⌘N for a screen that mounts no board at all.
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
  // The arrow keys and bare Enter gate on this predicate, not on
  // `isMissionBoardView`, which is true for the WHOLE employee screen: on its
  // Routines, Files or Settings section a handler that called
  // `preventDefault()` would fire nothing, with no list scrolling and no Enter
  // on the focused control.

  it("is never a board off the employee screen, whatever the stale section says", () => {
    // `agentSection` is sticky store state: it keeps the last employee's section
    // while the user is on the Agents home, and must not speak for it. Claiming
    // arrows and Enter there would swallow them over a plain list.
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
    // `null` is what the store holds before any section row is clicked, and
    // `resolveTeamSection` renders the employee's FIRST section for it.
    strictEqual(
      isMissionBoardSurface({ viewMode: AGENT_VIEW_ID, agentSection: null }),
      true,
    );
  });

  it("agrees with resolveTeamSection on what a null section renders", () => {
    // The two rules are duplicated across modules on purpose (this one has no
    // capabilities and no employee to consult), so pin them together: if the
    // employee screen ever opens on something other than Mission Control, this fails
    // instead of the predicate silently claiming the arrow keys on a non-board
    // section.
    strictEqual(
      resolveTeamSection(visibleAgentSections(null, {}), null),
      "mission-control",
    );
  });

  it("is NOT a board on an employee's Routines, Files or Settings", () => {
    // The regression. Each of these renders a list or a form, never a board, so
    // the arrows and Enter must be left to the surface underneath.
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
      // Even carrying a Mission Control section from the last team visited.
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
    // A shared hook must use an explicit top-level id, not an arbitrary tab.
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
      showSkills?: boolean;
    } = {},
  ) => ({
    showAiModels: over.showAiModels ?? false,
    showAssistant: over.showAssistant ?? false,
    showSkills: over.showSkills ?? false,
  });

  it("never blocks the Integrations page", () => {
    // The Integrations page is ungated: every role in every mode keeps the
    // personal catalog, so a stale viewMode can never strand there.
    strictEqual(blockedTopLevelView(INTEGRATIONS_VIEW_ID, gates()), false);
  });

  it("blocks a stale AI Models hub when its gate is off", () => {
    // A Teams member (role flipped) with a stale `ai-hub` viewMode must be
    // reported blocked and sent home.
    strictEqual(blockedTopLevelView(AI_HUB_VIEW_ID, gates()), true);
    strictEqual(
      blockedTopLevelView(AI_HUB_VIEW_ID, gates({ showAiModels: true })),
      false,
    );
  });

  it("blocks the shared Skills library for anyone but the space owner", () => {
    // A skill edit reaches every agent in the space, so a caller whose gate
    // closed (a role change, a space switch) must not be left standing on the
    // library with a stale `viewMode`.
    strictEqual(blockedTopLevelView(SKILLS_VIEW_ID, gates()), true);
    strictEqual(
      blockedTopLevelView(SKILLS_VIEW_ID, gates({ showSkills: true })),
      false,
    );
  });

  it("blocks the assistant where discovery hands out no address", () => {
    // The deployment serves none (501 gateway-only / 503 no agent tree), so a
    // `viewMode` left on it would strand the user on an unmounted screen.
    strictEqual(blockedTopLevelView(ASSISTANT_VIEW_ID, gates()), true);
    strictEqual(
      blockedTopLevelView(ASSISTANT_VIEW_ID, gates({ showAssistant: true })),
      false,
    );
  });

  it("never blocks the Academy: learning the product is everyone's", () => {
    // Ungated on purpose, exactly like About me: every deployment ships the
    // Academy, so no gate can ever strand a user off it.
    strictEqual(blockedTopLevelView(ACADEMY_VIEW_ID, gates()), false);
  });

  it("never blocks ungated top-level views or agent tabs", () => {
    // The employee screen has a gate of its own (`blockedAgentView`) rather
    // than a caps flag, so this one never blocks it.
    for (const id of [
      ACADEMY_VIEW_ID,
      // The phone's landing screen: a gate that could strand a user off it
      // would strand them off the app.
      AGENTS_HOME_VIEW_ID,
      SETTINGS_VIEW_ID,
      AGENT_VIEW_ID,
      "chat",
    ]) {
      strictEqual(blockedTopLevelView(id, gates()), false, id);
    }
  });
});
