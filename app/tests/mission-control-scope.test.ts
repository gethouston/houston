import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { KanbanItem } from "@houston-ai/board";
import {
  agentsInScope,
  filteredScopeAgent,
  GLOBAL_MISSION_DRAFT_SCOPE,
  inScope,
  itemsInScope,
  missionControlDraftScope,
  resolveFilterPath,
} from "../src/components/board/mission-control-scope.ts";

const agent = (folderPath: string) => ({ folderPath });
const card = (id: string, agentPath?: string): KanbanItem =>
  ({
    id,
    title: id,
    status: "running",
    ...(agentPath === undefined ? {} : { metadata: { agentPath } }),
  }) as KanbanItem;

describe("mission control scope", () => {
  it("no scope means every agent and every card, by reference", () => {
    const agents = [agent("a"), agent("b")];
    const items = [card("1", "a"), card("2", "b")];
    assert.equal(agentsInScope(agents, undefined), agents);
    assert.equal(itemsInScope(items, undefined), items);
    assert.equal(inScope(undefined, undefined), true);
  });

  it("a scope keeps only the agents and cards it names", () => {
    assert.deepEqual(
      agentsInScope([agent("a"), agent("b"), agent("c")], ["c", "a"]),
      [agent("a"), agent("c")],
    );
    assert.deepEqual(
      itemsInScope(
        [card("1", "a"), card("2", "b"), card("3", "c")],
        ["a", "c"],
      ).map((i) => i.id),
      ["1", "3"],
    );
  });

  it("an empty scope is a real scope, not an absent one", () => {
    assert.deepEqual(agentsInScope([agent("a")], []), []);
    assert.deepEqual(itemsInScope([card("1", "a")], []), []);
  });

  it("a card with no owning agent never survives a scope", () => {
    assert.deepEqual(itemsInScope([card("1")], ["a"]), []);
    assert.deepEqual(
      itemsInScope([card("1")], undefined).map((i) => i.id),
      ["1"],
    );
  });
});

describe("resolveFilterPath", () => {
  it("passes an in-scope filter through and treats empty as no filter", () => {
    assert.equal(resolveFilterPath("a", ["a", "b"]), "a");
    assert.equal(resolveFilterPath("a", undefined), "a");
    assert.equal(resolveFilterPath("", ["a"]), "");
    assert.equal(resolveFilterPath("", undefined), "");
  });

  it("drops a filter naming an agent outside the scope", () => {
    // The agent moved to another team while its board was open: showing every
    // agent beats an empty board whose filter menu cannot clear itself.
    assert.equal(resolveFilterPath("z", ["a", "b"]), "");
    assert.equal(resolveFilterPath("a", []), "");
  });
});

describe("missionControlDraftScope", () => {
  it("leaves the global board's scope byte-unchanged", () => {
    // Existing stored drafts live under the bare scope; namespacing the global
    // board too would silently orphan every one of them.
    assert.equal(GLOBAL_MISSION_DRAFT_SCOPE, "mission-control");
    assert.equal(missionControlDraftScope(), "mission-control");
    assert.equal(missionControlDraftScope(undefined), "mission-control");
  });

  it("gives each team its own namespaced scope", () => {
    assert.equal(missionControlDraftScope("team-a"), "mission-control:team-a");
    assert.notEqual(
      missionControlDraftScope("team-a"),
      missionControlDraftScope("team-b"),
    );
    // A team never collides with the global board either.
    assert.notEqual(
      missionControlDraftScope("team-a"),
      GLOBAL_MISSION_DRAFT_SCOPE,
    );
  });
});

describe("filteredScopeAgent", () => {
  const roster = [agent("Sales/Ana"), agent("Sales/Beto")];

  it("names the filtered agent, which the board's title then wears", () => {
    assert.deepEqual(filteredScopeAgent(roster, "Sales/Beto"), roster[1]);
  });

  it("means every agent when nothing is filtered", () => {
    assert.equal(filteredScopeAgent(roster, ""), null);
  });

  it("falls back to every agent when the path has no agent behind it", () => {
    // The title IS the filter now: a path nobody owns would otherwise leave
    // the board's only heading blank while the board shows everything.
    assert.equal(filteredScopeAgent(roster, "Sales/Gone"), null);
    assert.equal(filteredScopeAgent([], "Sales/Ana"), null);
  });
});

describe("mission control source draft scope wiring", () => {
  const source = readFileSync(
    new URL(
      "../src/components/board/use-mission-control-source.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  it("derives the draft scope from the board's team instead of hardcoding it", () => {
    assert.ok(source.includes("missionControlDraftScope(scope?.teamId)"));
    assert.ok(!source.includes('draftScope: "mission-control"'));
  });
});

/**
 * The agent filter is READ-ONLY on a board. The surfaces that change it (the
 * team strip's breadcrumb, the archive's own dropdown) write their own source
 * directly, so a board that also offered a setter would be a second, silent
 * way to move a pin the rail believes it owns.
 */
describe("the board applies the agent filter it is given", () => {
  const mcScope = readFileSync(
    new URL("../src/components/board/use-mc-scope.ts", import.meta.url),
    "utf8",
  );
  const teamBoardScope = readFileSync(
    new URL(
      "../src/components/team-view/use-team-board-scope.ts",
      import.meta.url,
    ),
    "utf8",
  );

  it("exposes no filter setter and keeps no filter state of its own", () => {
    assert.ok(!mcScope.includes("setFilterPath"));
    assert.ok(!mcScope.includes("useState"));
    // Nor a write-back callback: the scope is the filter a board RENDERS.
    assert.ok(!mcScope.includes("onFilterPathChange"));
    assert.ok(!teamBoardScope.includes("onFilterPathChange"));
  });

  it("applies the scope's filter verbatim, narrowed to the scope", () => {
    assert.match(
      mcScope,
      /resolveFilterPath\(scope\?\.filterPath \?\? "", scopePaths\)/,
    );
  });

  it("lets a focus argument override the team-wide pin it falls back to", () => {
    assert.ok(!teamBoardScope.includes("keepFocus"));
    assert.match(
      teamBoardScope,
      /useTeamScope\(\s*team,\s*agentFocusId \?\? teamAgentFilter,?\s*\)/,
    );
    // The pin is READ here and written by the rail, so the board hook has no
    // business holding the store's setter.
    assert.ok(!teamBoardScope.includes("setTeamAgentFilter"));
  });
});
