import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston-ai/engine-client";
import { teamCollapsedLookup } from "../src/components/shell/team-sidebar-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";

// The rail's pure team vocabulary: which blocks are folded.
//
// `agentsInTeams` is GONE, along with its tests: the gateway now serves a
// member only the teams they are part of, so the rail draws every team the read
// returned and there is no unjoined team whose agents could spill into the
// default block.

const team = (id: string, isDefault = false): TeamView => ({
  id,
  name: id,
  agents: [],
  isDefault,
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
