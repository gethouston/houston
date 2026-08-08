import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentTeamMember } from "@houston-ai/engine-client";
import {
  buildTeamMemberRows,
  clampToRunes,
  TEAM_NAME_MAX_RUNES,
  type TeamRosterPerson,
  teamLeaveUserId,
  teamMembersView,
  teamNameCommit,
} from "../src/components/team-view/team-members-model.ts";
import type { ServerTeamFacts, TeamView } from "../src/lib/teams-model.ts";

const facts = (over: Partial<ServerTeamFacts> = {}): ServerTeamFacts => ({
  joined: true,
  owner: false,
  memberCount: 2,
  sortOrder: 0,
  ...over,
});

/** A team with no agents: nothing here reads them. */
const team = (over: Partial<TeamView> = {}): TeamView => ({
  id: "t1",
  name: "Sales",
  agents: [],
  isDefault: false,
  ...over,
});

const member = (userId: string, owner = false): AgentTeamMember => ({
  userId,
  owner,
});

const person = (userId: string, email?: string): TeamRosterPerson =>
  ({ userId, email }) as TeamRosterPerson;

describe("buildTeamMemberRows", () => {
  it("names each row off the org roster and falls back to the raw id", () => {
    const rows = buildTeamMemberRows({
      members: [member("u1"), member("u2")],
      roster: [person("u1", "ada@x.com")],
      selfId: null,
      readOnly: true,
    });
    assert.deepEqual(
      rows.map((r) => r.name),
      ["ada@x.com", "u2"],
    );
  });

  it("puts owners first, then the caller inside its band, then names", () => {
    const rows = buildTeamMemberRows({
      // `u-me` is a plain member and sorts LAST by name, so its position is
      // the self rule and nothing else.
      members: [
        member("u-zoe", false),
        member("u-me", false),
        member("u-bob", true),
        member("u-ann", true),
      ],
      roster: [
        person("u-zoe", "aaa@x.com"),
        person("u-me", "zzz@x.com"),
        person("u-bob", "bob@x.com"),
        person("u-ann", "ann@x.com"),
      ],
      selfId: "u-me",
      readOnly: true,
    });
    assert.deepEqual(
      rows.map((r) => r.userId),
      ["u-ann", "u-bob", "u-me", "u-zoe"],
    );
  });

  it("sorts by name inside a band, with the id as the tiebreak", () => {
    const rows = buildTeamMemberRows({
      members: [member("u2"), member("u1")],
      roster: [person("u1", "same@x.com"), person("u2", "same@x.com")],
      selfId: null,
      readOnly: true,
    });
    assert.deepEqual(
      rows.map((r) => r.userId),
      ["u1", "u2"],
    );
  });

  it("marks the caller's own row and never lets it be edited", () => {
    const rows = buildTeamMemberRows({
      members: [member("me"), member("other")],
      roster: [],
      selfId: "me",
      readOnly: false,
    });
    const me = rows.find((r) => r.userId === "me");
    const other = rows.find((r) => r.userId === "other");
    assert.equal(me?.isSelf, true);
    assert.equal(me?.editable, false);
    assert.equal(other?.isSelf, false);
    assert.equal(other?.editable, true);
  });

  it("makes every row static when the card is read-only", () => {
    const rows = buildTeamMemberRows({
      members: [member("u1"), member("u2", true)],
      roster: [],
      selfId: "u9",
      readOnly: true,
    });
    assert.ok(rows.every((r) => !r.editable));
  });

  it("carries the server's owner flag through untouched", () => {
    const rows = buildTeamMemberRows({
      members: [member("u1", true)],
      roster: [],
      selfId: null,
      readOnly: true,
    });
    assert.equal(rows[0].owner, true);
  });
});

describe("teamMembersView", () => {
  it("hides the whole card on the local backend", () => {
    assert.deepEqual(teamMembersView(team()), {
      visible: false,
      showRoster: false,
      readOnly: true,
      showDefaultNote: false,
      showAdminNote: false,
    });
  });

  it("gives an owner a writable roster with the admin note", () => {
    assert.deepEqual(
      teamMembersView(team({ server: facts({ owner: true }) })),
      {
        visible: true,
        showRoster: true,
        readOnly: false,
        showDefaultNote: false,
        showAdminNote: true,
      },
    );
  });

  it("gives a non-owner the same roster, static", () => {
    const view = teamMembersView(team({ server: facts({ owner: false }) }));
    assert.equal(view.showRoster, true);
    assert.equal(view.readOnly, true);
  });

  it("replaces the default team's roster with its note, even for an owner", () => {
    assert.deepEqual(
      teamMembersView(
        team({ isDefault: true, server: facts({ owner: true }) }),
      ),
      {
        visible: true,
        showRoster: false,
        readOnly: true,
        showDefaultNote: true,
        showAdminNote: false,
      },
    );
  });
});

describe("teamLeaveUserId", () => {
  it("offers Leave to a joined member of a named team", () => {
    assert.equal(teamLeaveUserId(team({ server: facts() }), "me"), "me");
  });

  it("offers nothing without a session, since the call names a user", () => {
    assert.equal(teamLeaveUserId(team({ server: facts() }), null), null);
  });

  it("offers nothing on the default team or on the local backend", () => {
    assert.equal(
      teamLeaveUserId(team({ isDefault: true, server: facts() }), "me"),
      null,
    );
    assert.equal(teamLeaveUserId(team(), "me"), null);
  });
});

describe("teamNameCommit", () => {
  it("commits a trimmed, changed name", () => {
    assert.equal(teamNameCommit("  Growth  ", "Sales"), "Growth");
  });

  it("refuses an empty or whitespace-only name", () => {
    assert.equal(teamNameCommit("", "Sales"), null);
    assert.equal(teamNameCommit("   ", "Sales"), null);
  });

  it("refuses a name that only differs by whitespace", () => {
    assert.equal(teamNameCommit("  Sales ", "Sales"), null);
    assert.equal(teamNameCommit("Sales", " Sales "), null);
  });

  // The gateway's rule is 1..60 RUNES after trimming (`validName` in
  // packages/fake-host/src/agent-teams-wire.ts, mirroring C13). Save must never
  // promise a write it would refuse with `invalid_name`.
  it("commits a name of exactly the 60-rune ceiling", () => {
    const name = "a".repeat(TEAM_NAME_MAX_RUNES);
    assert.equal(teamNameCommit(`  ${name}  `, "Sales"), name);
  });

  it("refuses one rune past the ceiling", () => {
    assert.equal(teamNameCommit("a".repeat(61), "Sales"), null);
  });

  // The case a naive `maxLength` / `.length` check gets wrong: 60 emoji are 120
  // UTF-16 code units but 60 code points, and the gateway ACCEPTS them.
  it("commits 60 astral runes even though they are 120 UTF-16 units", () => {
    const name = "🙂".repeat(60);
    assert.equal(name.length, 120);
    assert.equal(teamNameCommit(name, "Sales"), name);
  });

  it("refuses 61 astral runes", () => {
    assert.equal(teamNameCommit("🙂".repeat(61), "Sales"), null);
  });
});

describe("clampToRunes", () => {
  it("leaves a value at or under the ceiling untouched", () => {
    assert.equal(clampToRunes("Sales", 60), "Sales");
    assert.equal(clampToRunes("a".repeat(60), 60), "a".repeat(60));
    assert.equal(clampToRunes("", 60), "");
  });

  it("truncates by RUNES, never by UTF-16 units", () => {
    // A UTF-16 `slice(0, 60)` would keep 30 emoji here.
    assert.equal(clampToRunes("🙂".repeat(80), 60), "🙂".repeat(60));
    assert.equal(clampToRunes("a".repeat(80), 60), "a".repeat(60));
  });

  it("never splits a surrogate pair", () => {
    for (let max = 0; max <= 6; max++) {
      const clamped = clampToRunes("🙂".repeat(6), max);
      assert.equal(clamped, "🙂".repeat(max));
      // A lone surrogate would make the string unpaired and un-round-trippable.
      assert.equal([...clamped].length, max);
      assert.equal(clamped.length, max * 2);
    }
  });

  it("clamps a negative ceiling to nothing rather than throwing", () => {
    assert.equal(clampToRunes("Sales", -1), "");
  });
});
