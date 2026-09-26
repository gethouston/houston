import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import { teamCollapsedLookup } from "../src/components/shell/team-sidebar-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";

const team = (id: string): TeamView => ({ id, name: id, agents: [] });
const layout = (groups: SidebarLayout["groups"]): SidebarLayout => ({
  groups,
  order: [],
});

describe("teamCollapsedLookup", () => {
  it("reads each folder's stored collapsed flag", () => {
    const collapsed = teamCollapsedLookup(
      layout([
        { id: "t1", name: "One", agentIds: [], collapsed: true },
        { id: "t2", name: "Two", agentIds: [], collapsed: false },
      ]),
    );
    assert.equal(collapsed(team("t1")), true);
    assert.equal(collapsed(team("t2")), false);
  });

  it("treats a folder missing from the layout as expanded", () => {
    assert.equal(teamCollapsedLookup(layout([]))(team("missing")), false);
  });
});
