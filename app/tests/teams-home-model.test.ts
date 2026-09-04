import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  TEAM_SECTION_ORDER,
  teamTreeRows,
  teamTreeTarget,
} from "../src/components/teams-home/teams-home-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * The phone's Teams tree. The tree is the ONLY way into a team's sections on a
 * phone, so two properties are the whole test: every row it draws is a section
 * the desktop strip would offer this caller, in the strip's order, and the
 * Team Settings row lands where the desktop's own door lands (the drilled
 * level, on Context).
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

const member = () =>
  caps({ multiplayer: true, role: "user" } as Partial<Capabilities>);

const ids = (teams: TeamView[], capabilities: Capabilities): string[] =>
  teamTreeRows(teams, capabilities)[0].sections.map((s) => s.id);

describe("teamTreeRows", () => {
  it("draws the desktop strip's sections for a manager, in its order", () => {
    assert.deepEqual(ids([team()], caps()), [
      "mission-control",
      "routines",
      "files",
      "settings",
    ]);
  });

  it("gives a plain member the work sections and no Team Settings door", () => {
    assert.deepEqual(ids([team()], member()), [
      "mission-control",
      "routines",
      "files",
    ]);
  });

  it("offers the door to a team owner who is not an org admin", () => {
    const owned = team({
      server: { joined: true, owner: true, memberCount: 3, sortOrder: 0 },
    });
    assert.ok(ids([owned], member()).includes("settings"));
  });

  it("draws the virtual default team like any other", () => {
    const rows = teamTreeRows(
      [team(), team({ id: "team:default", isDefault: true, agents: [] })],
      caps(),
    );
    assert.deepEqual(
      rows.map((row) => row.team.id),
      ["t1", "team:default"],
    );
    assert.ok(rows[1].sections.length > 0);
  });

  it("never draws a drilled-level section as a row of its own", () => {
    // Context, Agents, People and Settings live behind the Team Settings door,
    // as they do on the desktop; the tree names the door, not its rooms.
    const [row] = teamTreeRows([team()], caps());
    for (const section of row.sections) {
      assert.ok(TEAM_SECTION_ORDER.includes(section.id));
    }
    const drawn: string[] = row.sections.map((section) => section.id);
    for (const hidden of ["context", "people", "agents"]) {
      assert.ok(!drawn.includes(hidden));
    }
  });
});

describe("teamTreeTarget", () => {
  it("lands the Team Settings row on the drilled level's first tab", () => {
    assert.deepEqual(teamTreeTarget({ id: "settings" }), {
      section: "context",
      teamSettingsFocus: true,
    });
  });

  it("lands every other row on its own base-level section", () => {
    for (const id of ["mission-control", "routines", "files"] as const) {
      assert.deepEqual(teamTreeTarget({ id }), {
        section: id,
        teamSettingsFocus: false,
      });
    }
  });
});
