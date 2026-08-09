import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditTeamContext,
  teamContextSource,
} from "../src/components/team-view/team-context-model.ts";
import type { ServerTeamFacts, TeamView } from "../src/lib/teams-model.ts";

// The Team context card's whole decision: WHICH store it edits, and whether the
// caller may write to it. Three backends answer the first question and the
// second is a team-owner gate, so both are pure and unit-tested here rather
// than discovered by clicking through three deployments.

const team = (over: Partial<TeamView> = {}): TeamView => ({
  id: "t-1",
  name: "Payroll",
  agents: [],
  isDefault: false,
  ...over,
});

const server = (over: Partial<ServerTeamFacts> = {}): ServerTeamFacts => ({
  joined: true,
  owner: true,
  memberCount: 2,
  sortOrder: 0,
  ...over,
});

describe("teamContextSource", () => {
  it("edits the stored GROUP for a named local team", () => {
    assert.deepEqual(
      teamContextSource(team({ context: "Ship weekly." }), undefined),
      { kind: "group", content: "Ship weekly." },
    );
  });

  it("shows an EMPTY group editor when nobody has written a context yet", () => {
    // Absence is not "unsupported" on the local backend: the stored group has
    // always been able to hold one, so the card stands with an empty box.
    assert.deepEqual(teamContextSource(team(), undefined), {
      kind: "group",
      content: "",
    });
  });

  it("edits the LAYOUT's default-team context for the local default team", () => {
    // The default team is virtual and owns no group row, so its context rides
    // the layout beside `defaultCollapsed` — and the host fans THAT out to every
    // ungrouped agent's GROUP.md, which is what makes the card's promise true.
    assert.deepEqual(
      teamContextSource(team({ isDefault: true }), "We ship daily."),
      { kind: "default", content: "We ship daily." },
    );
  });

  it("shows an EMPTY default editor when no default context is stored", () => {
    // Absent means nobody has written one, exactly as it does for a named team:
    // an empty box, never a missing card.
    assert.deepEqual(teamContextSource(team({ isDefault: true }), undefined), {
      kind: "default",
      content: "",
    });
  });

  it("ignores the default context for a NAMED local team", () => {
    // The two are separate stores: a named team's members are not in the
    // default team and must never be shown its text.
    assert.deepEqual(
      teamContextSource(team({ context: "Team text." }), "Default text."),
      { kind: "group", content: "Team text." },
    );
  });

  it("edits the GATEWAY's field on a server team that is served one", () => {
    assert.deepEqual(
      teamContextSource(
        team({ context: "Acme rules.", server: server() }),
        undefined,
      ),
      { kind: "server", content: "Acme rules." },
    );
  });

  it("keeps the server editor for a served but EMPTY context", () => {
    // `""` is the column's default, not a missing field: emptying the box must
    // not make the card disappear.
    assert.deepEqual(
      teamContextSource(team({ context: "", server: server() }), undefined),
      { kind: "server", content: "" },
    );
  });

  it("renders NOTHING on a server team whose gateway omits the field", () => {
    // The one hide case: an editor that saves into a 400 and an injection no
    // agent would ever receive is worse than no editor.
    assert.equal(
      teamContextSource(team({ server: server() }), undefined),
      null,
    );
    assert.equal(
      teamContextSource(team({ isDefault: true, server: server() }), "local"),
      null,
    );
  });
});

describe("canEditTeamContext", () => {
  it("lets the local user edit every team, the default one included", () => {
    // Unlike `canRenameTeam`, which refuses the local default team because
    // nothing in the stack can rename a workspace: that is a missing mechanism,
    // not missing authority.
    assert.equal(canEditTeamContext(team()), true);
    assert.equal(canEditTeamContext(team({ isDefault: true })), true);
  });

  it("is a team-OWNER power on a server host", () => {
    assert.equal(
      canEditTeamContext(team({ server: server({ owner: true }) })),
      true,
    );
    assert.equal(
      canEditTeamContext(team({ server: server({ owner: false }) })),
      false,
    );
  });

  it("gives a non-owner the READ-ONLY face rather than hiding the card", () => {
    // Knowing what your team's agents are told is not a privilege — the source
    // still resolves, only the write is withheld.
    const view = team({
      context: "Acme rules.",
      server: server({ owner: false }),
    });
    assert.deepEqual(teamContextSource(view, undefined), {
      kind: "server",
      content: "Acme rules.",
    });
    assert.equal(canEditTeamContext(view), false);
  });
});
