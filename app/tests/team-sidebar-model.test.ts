import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston-ai/engine-client";
import {
  teamAffordanceMask,
  teamCollapsedLookup,
} from "../src/components/shell/team-sidebar-model.ts";
import type { ServerTeamFacts, TeamView } from "../src/lib/teams-model.ts";

// The rail's pure team vocabulary: which blocks are folded, and which
// header-menu affordances each block offers.
//
// `agentsInTeams` is GONE, along with its tests: the gateway now serves a
// member only the teams they are part of, so the rail draws every team the read
// returned and there is no unjoined team whose agents could spill into the
// default block.

const team = (
  id: string,
  isDefault = false,
  server?: Partial<ServerTeamFacts>,
): TeamView => ({
  id,
  name: id,
  agents: [],
  isDefault,
  ...(server
    ? {
        server: {
          joined: true,
          owner: false,
          memberCount: 1,
          sortOrder: 0,
          ...server,
        },
      }
    : {}),
});

const layout = (partial: Partial<SidebarLayout>): SidebarLayout =>
  ({ groups: [], ungroupedOrder: [], ...partial }) as SidebarLayout;

describe("teamCollapsedLookup", () => {
  it("reads a named team's own stored group flag", () => {
    const isCollapsed = teamCollapsedLookup(
      layout({
        groups: [
          { id: "t1", name: "t1", agentIds: [], collapsed: true },
          { id: "t2", name: "t2", agentIds: [], collapsed: false },
        ],
      } as Partial<SidebarLayout>),
    );
    assert.equal(isCollapsed(team("t1")), true);
    assert.equal(isCollapsed(team("t2")), false);
  });

  it("reads the VIRTUAL default team from the layout's own field", () => {
    // The default team owns no stored group row, so a `groups` entry that
    // happens to share its id must not answer for it.
    const isCollapsed = teamCollapsedLookup(
      layout({
        defaultCollapsed: true,
        groups: [{ id: "ws", name: "ws", agentIds: [], collapsed: false }],
      } as Partial<SidebarLayout>),
    );
    assert.equal(isCollapsed(team("ws", true)), true);
  });

  it("treats an absent flag, an absent row and a corrupt layout as expanded", () => {
    assert.equal(teamCollapsedLookup(layout({}))(team("ws", true)), false);
    assert.equal(teamCollapsedLookup(layout({}))(team("t1")), false);
    const corrupt = teamCollapsedLookup({} as SidebarLayout);
    assert.equal(corrupt(team("t1")), false);
    assert.equal(corrupt(team("ws", true)), false);
  });
});

describe("teamAffordanceMask", () => {
  const mask = (args: {
    serverBacked: boolean;
    personalSpace?: boolean;
    selfId?: string | null;
  }) =>
    teamAffordanceMask({
      serverBacked: args.serverBacked,
      personalSpace: args.personalSpace ?? false,
      selfId: args.selfId === undefined ? "u1" : args.selfId,
    });

  it("passes NO mask off-capability, which is the pre-C13 rendering", () => {
    const off = mask({ serverBacked: false });
    assert.equal(off(team("t1")), undefined);
    assert.equal(off(team("ws", true)), undefined);
  });

  it("gives an owner edit and delete", () => {
    // ONE identity entry: name, mark and colour are edited together in the
    // "Change icon & name" dialog, so the mask carries a single `edit` gate.
    // No context entry among them on EITHER backend any more: a team's shared
    // context is the first card of its focused agent screen, one door onto it.
    const owned = mask({ serverBacked: true })(
      team("t1", false, { owner: true }),
    );
    assert.deepEqual(owned, {
      edit: true,
      delete: true,
      leave: true,
    });
  });

  it("offers edit on the rename gate, the default team included", () => {
    const asOwner = mask({ serverBacked: true });
    const def = asOwner(team("ws", true, { owner: true }));
    // The default team is renamable server-side (C13 reads its identity as a
    // rename) but never deletable, so edit follows rename rather than delete.
    assert.equal(def?.edit, true);
    assert.equal(def?.delete, false);

    const member = mask({ serverBacked: true })(
      team("t1", false, { owner: false }),
    );
    assert.equal(member?.edit, false);
  });

  it("withholds Leave with no session id and in a personal space", () => {
    const joined = team("t1", false, { joined: true });
    assert.equal(
      mask({ serverBacked: true, selfId: null })(joined)?.leave,
      false,
    );
    assert.equal(
      mask({ serverBacked: true, personalSpace: true })(joined)?.leave,
      false,
    );
    assert.equal(mask({ serverBacked: true })(joined)?.leave, true);
  });
});
