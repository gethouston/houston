import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  TEAM_SECTION_ORDER,
  teamTreeRows,
} from "../src/components/teams-home/teams-home-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * The phone's Teams tree. The tree is the ONLY way into a team's sections on a
 * phone, so two properties are the whole test: every row it draws is a section
 * the team view would actually render for this caller, and every row carries
 * the level it came from — a `settingsLevel` row opens with
 * `teamSettingsFocus`, and getting that wrong lands the user on the base level
 * with a section it does not have.
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

const solo = { personalSpace: false, spacesHost: false };

const ids = (
  teams: TeamView[],
  capabilities: Capabilities,
  space = solo,
): string[] =>
  teamTreeRows(teams, capabilities, space)[0].sections.map((s) => s.id);

describe("teamTreeRows", () => {
  it("draws every section a single-player manager has, in tree order", () => {
    // No org at all: the solo user manages their own team, and there is nobody
    // to show under People, so the roster row is the one that stays away.
    assert.deepEqual(ids([team()], caps()), [
      "mission-control",
      "routines",
      "context",
      "files",
      "settings",
    ]);
  });

  it("gives a plain member the work sections and no configuration", () => {
    assert.deepEqual(ids([team()], member()), [
      "mission-control",
      "routines",
      "files",
    ]);
  });

  it("marks only the drilled level's rows as settings-level", () => {
    const [row] = teamTreeRows([team()], caps(), solo);
    const drilled = row.sections
      .filter((section) => section.settingsLevel)
      .map((section) => section.id);
    assert.deepEqual(drilled, ["context", "settings"]);
    const base = row.sections
      .filter((section) => !section.settingsLevel)
      .map((section) => section.id);
    assert.deepEqual(base, ["mission-control", "routines", "files"]);
  });

  it("shows People on a server team in a shared space", () => {
    const shared = team({
      server: { joined: true, owner: true, memberCount: 3, sortOrder: 0 },
    });
    assert.deepEqual(ids([shared], member()), [
      "mission-control",
      "routines",
      "context",
      "people",
      "files",
      "settings",
    ]);
  });

  it("hides People from a member who cannot configure the team", () => {
    const shared = team({
      server: { joined: true, owner: false, memberCount: 3, sortOrder: 0 },
    });
    assert.ok(!ids([shared], member()).includes("people"));
  });

  it("offers the personal space's invite face as People", () => {
    // A space with one human has no roster, but it does have a door to invite
    // someone, so the row exists and the tree must not swallow it.
    const rows = ids([team()], caps(), {
      personalSpace: true,
      spacesHost: true,
    });
    assert.ok(rows.includes("people"));
  });

  it("draws the virtual default team like any other", () => {
    const rows = teamTreeRows(
      [team(), team({ id: "team:default", isDefault: true, agents: [] })],
      caps(),
      solo,
    );
    assert.deepEqual(
      rows.map((row) => row.team.id),
      ["t1", "team:default"],
    );
    assert.ok(rows[1].sections.length > 0);
  });

  it("never draws a section outside the pinned order", () => {
    // `agents` is a settings-level section the tree deliberately drops: the
    // phone reaches an agent through its own tab.
    const [row] = teamTreeRows([team()], caps(), solo);
    for (const section of row.sections) {
      assert.ok(TEAM_SECTION_ORDER.includes(section.id));
    }
    const drawn: string[] = row.sections.map((section) => section.id);
    assert.ok(!drawn.includes("agents"));
  });
});
