import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  TEAM_SECTION_TAB_KEYS,
  teamSectionTabs,
} from "../src/components/team-view/team-section-tabs-model.ts";
import {
  type TeamView,
  visibleTeamSectionsForTeam,
} from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * The team strip's LABELLED lozenges. The rail draws no section rows any more,
 * so the strip is the ONLY way between a team's sections, which makes one
 * property the whole test: the labelled run IS `visibleTeamSectionsForTeam`,
 * in order, minus the board. A run that added a lozenge would offer a section
 * the view refuses to render; one that dropped a section would strand it with
 * no door at all.
 *
 * The board is the exception ON PURPOSE: the team's own lozenge stands for it,
 * so the word "Tasks" appears nowhere in the chrome.
 */

const agent = (id: string): Agent => ({ id, name: id }) as Agent;

const team = (over: Partial<TeamView> = {}): TeamView => ({
  id: "t1",
  name: "Design",
  agents: [agent("a")],
  isDefault: false,
  ...over,
});

const caps = (over: Partial<Capabilities> = {}): Capabilities =>
  ({ multiplayer: false, ...over }) as Capabilities;

describe("teamSectionTabs", () => {
  it("is the visible sections, in order, minus the board", () => {
    const sections = visibleTeamSectionsForTeam(caps(), team());
    assert.deepEqual(
      teamSectionTabs(sections).map((tab) => tab.id),
      sections.filter((id) => id !== "mission-control"),
    );
    // The board is dropped, never relabelled: the team's lozenge IS that door.
    assert.ok(
      !teamSectionTabs(sections).some((tab) => tab.id === "mission-control"),
    );
  });

  it("gives a member the WORK tabs and no Manage agents", () => {
    // Multiplayer, plain user, managing nothing: the configure section is not
    // theirs, so the row must not draw the last tab. Archived is WORK, so they
    // keep it.
    const sections = visibleTeamSectionsForTeam(
      caps({ multiplayer: true, role: "user" } as Partial<Capabilities>),
      team(),
    );
    assert.deepEqual(
      teamSectionTabs(sections).map((tab) => tab.id),
      ["routines", "files", "archived"],
    );
  });

  it("gives a team OWNER the Manage agents tab, last", () => {
    const sections = visibleTeamSectionsForTeam(
      caps({ multiplayer: true, role: "user" } as Partial<Capabilities>),
      team({
        server: { joined: true, owner: true, memberCount: 2, sortOrder: 0 },
      }),
    );
    assert.deepEqual(
      teamSectionTabs(sections).map((tab) => tab.id),
      ["routines", "files", "archived", "settings"],
    );
  });

  it("labels every section from the teams namespace, one key each", () => {
    const keys = Object.values(TEAM_SECTION_TAB_KEYS);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) assert.match(key, /^teamView\.tabs\./);
  });

  it("draws nothing for an empty section list", () => {
    assert.deepEqual(teamSectionTabs([]), []);
  });
});
