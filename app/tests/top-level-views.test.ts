import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { INTEGRATIONS_VIEW_ID } from "../src/components/integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../src/components/skills-view/id.ts";
import { STORE_VIEW_ID } from "../src/components/store-view/id.ts";
import { SETTINGS_SECTION_IDS } from "../src/lib/settings-sections.ts";
import type { TeamSectionId, TeamView } from "../src/lib/teams-model.ts";
import {
  DEFAULT_TEAM_ID,
  resolveTeamSection,
  visibleTeamSectionsForTeam,
} from "../src/lib/teams-model.ts";
import {
  AI_HUB_VIEW_ID,
  blockedTopLevelView,
  DASHBOARD_VIEW_ID,
  isActiveTopLevelView,
  isMissionBoardSurface,
  isMissionBoardView,
  isTopLevelView,
  SETTINGS_VIEW_ID,
  TEAM_VIEW_ID,
  TOP_LEVEL_VIEWS,
} from "../src/lib/top-level-views.ts";

describe("isTopLevelView", () => {
  it("recognizes the top-level views", () => {
    for (const id of [
      DASHBOARD_VIEW_ID,
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      INTEGRATIONS_VIEW_ID,
      SKILLS_VIEW_ID,
      STORE_VIEW_ID,
      // One screen for every team: which team is open is store state, not an id.
      TEAM_VIEW_ID,
    ]) {
      strictEqual(isTopLevelView(id), true, id);
    }
  });

  it("is exactly those seven, and no settings section doubles as one", () => {
    // HOU-788 folded Time worked / Permissions / Admin into Settings sections;
    // a settings section is reached THROUGH `settings`, so none of their ids may
    // also resolve as a top-level view. Checking the live section list (rather
    // than the three retired string literals) keeps this failing if a future
    // section is wired up as a top-level view by mistake, and still covers the
    // stale-persisted-`viewMode` case that motivated it.
    strictEqual(TOP_LEVEL_VIEWS.size, 7);
    for (const section of SETTINGS_SECTION_IDS) {
      strictEqual(isTopLevelView(section), false, section);
    }
    // The retired `viewMode` values a pre-HOU-788 install may still have pinned.
    strictEqual(isTopLevelView("usage"), false);
    strictEqual(isTopLevelView("organization"), false);
  });

  it("treats everything else as an agent tab", () => {
    strictEqual(isTopLevelView("chat"), false);
    strictEqual(isTopLevelView("integrations"), false);
    // "skills" is the per-agent Agent Settings screen id, not the global page.
    strictEqual(isTopLevelView("skills"), false);
  });
});

describe("isMissionBoardView", () => {
  it("covers the global board and every team's board", () => {
    // Both own the global "New mission" handler, so ⌘N and the palette must
    // fire it in place; missing the team board sent the user to an agent tab.
    strictEqual(isMissionBoardView(DASHBOARD_VIEW_ID), true);
    strictEqual(isMissionBoardView(TEAM_VIEW_ID), true);
  });

  it("covers nothing else", () => {
    for (const id of [
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      STORE_VIEW_ID,
      SKILLS_VIEW_ID,
      "activity",
      "chat",
    ]) {
      strictEqual(isMissionBoardView(id), false, id);
    }
  });
});

describe("isMissionBoardSurface", () => {
  // The keyboard bug this predicate exists for: the arrow keys and bare Enter
  // used to gate on `isMissionBoardView`, which is true for the WHOLE team view.
  // On Routines / Files / Team Settings the handler still called
  // `preventDefault()` and then fired nothing — no list scrolling, no Enter on
  // the focused control, no feedback at all.

  it("is a board on the global Mission Control, whatever the stale team section says", () => {
    // `teamSection` is sticky store state: it keeps the last team's section
    // while the user is on the dashboard, and must not speak for it.
    for (const teamSection of [
      null,
      "mission-control",
      "routines",
      "files",
      "settings",
    ] as const) {
      strictEqual(
        isMissionBoardSurface({ viewMode: DASHBOARD_VIEW_ID, teamSection }),
        true,
        `${teamSection}`,
      );
    }
  });

  it("is a board on a team whose open section is Mission Control", () => {
    strictEqual(
      isMissionBoardSurface({
        viewMode: TEAM_VIEW_ID,
        teamSection: "mission-control",
      }),
      true,
    );
  });

  it("is a board on a team with no section chosen yet", () => {
    // `null` is what the store holds before any section row is clicked, and
    // `resolveTeamSection` renders the team's FIRST section for it.
    strictEqual(
      isMissionBoardSurface({ viewMode: TEAM_VIEW_ID, teamSection: null }),
      true,
    );
  });

  it("agrees with resolveTeamSection on what a null section renders", () => {
    // The two rules are duplicated across modules on purpose (this one has no
    // capabilities and no team to consult), so pin them together: if the team
    // view ever opens on something other than Mission Control, this fails
    // instead of the predicate silently claiming the arrow keys on a non-board
    // section.
    const team: TeamView = {
      id: DEFAULT_TEAM_ID,
      name: "Acme",
      agents: [],
      isDefault: true,
    };
    strictEqual(
      resolveTeamSection(visibleTeamSectionsForTeam(null, team), null),
      "mission-control",
    );
  });

  it("is NOT a board on a team's Routines, Files or Team Settings", () => {
    // The regression. Each of these renders a list or a form, never a board, so
    // the arrows and Enter must be left to the surface underneath.
    for (const teamSection of [
      "routines",
      "files",
      "settings",
    ] satisfies TeamSectionId[]) {
      strictEqual(
        isMissionBoardSurface({ viewMode: TEAM_VIEW_ID, teamSection }),
        false,
        teamSection,
      );
    }
  });

  it("is NOT a board on any other view", () => {
    for (const viewMode of [
      SETTINGS_VIEW_ID,
      AI_HUB_VIEW_ID,
      STORE_VIEW_ID,
      SKILLS_VIEW_ID,
      INTEGRATIONS_VIEW_ID,
      "activity",
      "chat",
    ]) {
      // Even carrying a Mission Control section from the last team visited.
      strictEqual(
        isMissionBoardSurface({ viewMode, teamSection: "mission-control" }),
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
      isActiveTopLevelView(DASHBOARD_VIEW_ID, SETTINGS_VIEW_ID),
      false,
    );
  });

  it("keeps a settings-section read active for the whole Settings screen", () => {
    // Time worked, Admin and Permissions have no screen of their own since
    // HOU-788, so their polls key off Settings being the visible screen.
    strictEqual(isActiveTopLevelView(SETTINGS_VIEW_ID, AI_HUB_VIEW_ID), false);
  });
});

describe("blockedTopLevelView", () => {
  it("never blocks the Integrations page", () => {
    // The Integrations page is ungated: every role in every mode keeps the
    // personal catalog, so a stale viewMode can never strand there.
    strictEqual(
      blockedTopLevelView(INTEGRATIONS_VIEW_ID, { showAiModels: false }),
      false,
    );
  });

  it("never blocks the global Skills page", () => {
    // Skills is ungated like Integrations: it operates on the caller's own
    // agents through per-agent routes, so every role keeps it.
    strictEqual(
      blockedTopLevelView(SKILLS_VIEW_ID, { showAiModels: false }),
      false,
    );
  });

  it("blocks a stale AI Models hub when its gate is off", () => {
    // A Teams member (role flipped) with a stale `ai-hub` viewMode must be
    // reported blocked and reset to the dashboard.
    strictEqual(
      blockedTopLevelView(AI_HUB_VIEW_ID, { showAiModels: false }),
      true,
    );
    strictEqual(
      blockedTopLevelView(AI_HUB_VIEW_ID, { showAiModels: true }),
      false,
    );
  });

  it("never blocks ungated top-level views or agent tabs", () => {
    // The team view has a gate of its own (`blockedTeamView`, over the resolved
    // teams) rather than a caps flag, so this one never blocks it.
    for (const id of [
      DASHBOARD_VIEW_ID,
      SETTINGS_VIEW_ID,
      STORE_VIEW_ID,
      TEAM_VIEW_ID,
      "chat",
    ]) {
      strictEqual(blockedTopLevelView(id, { showAiModels: false }), false, id);
    }
  });
});
