import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { KanbanItem } from "@houston-ai/board";
import {
  agentsInScope,
  itemsInScope,
} from "../src/components/board/mission-control-scope.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const teamMissionControl = read(
  "../src/components/team-view/team-mission-control.tsx",
);
const missionControlArchived = read(
  "../src/components/board/mission-control-archived.tsx",
);
const teamMissionBoard = read(
  "../src/components/team-view/team-mission-board.tsx",
);
const teamAgentsList = read("../src/components/team-view/team-agents-list.tsx");
const permissionsAgentsList = read(
  "../src/components/permissions/agents-list.tsx",
);

/** The JSX attributes of the `<MissionControlArchived …>` element. */
const archivedCallSite = (source: string) => {
  const start = source.indexOf("<MissionControlArchived");
  assert.notEqual(start, -1, "no <MissionControlArchived> element");
  return source.slice(start, source.indexOf("/>", start));
};

const agent = (folderPath: string) => ({ folderPath });
const card = (id: string, agentPath: string): KanbanItem =>
  ({
    id,
    title: id,
    status: "running",
    metadata: { agentPath },
  }) as KanbanItem;

/**
 * A team's archive must read the SAME `all-conversations` query as every other
 * board. Handing it only the team's agents minted a second query key, which
 * cost a second cross-agent fan-out, cancelled the pending global re-sweep
 * (its roster string no longer matched), and let the team's narrow result seed
 * the global board as placeholder data.
 */
describe("one sweep, whatever the scope", () => {
  it("gives the team archive the full roster plus the shared scope", () => {
    const call = archivedCallSite(teamMissionControl);
    assert.ok(
      !call.includes("agents={team.agents}"),
      "the team archive must not key its sweep on the team's agents",
    );
    assert.match(call, /agents=\{agents\}/);
    assert.match(call, /scope=\{scope\}/);
    assert.match(
      teamMissionControl,
      /useAgentStore\(\(s\) => s\.agents\)/,
      "the team section must own the full roster",
    );
    assert.match(teamMissionControl, /useTeamBoardScope\(team\)/);
  });

  it("shares one scope object between the team's active board and its archive", () => {
    const board = archivedCallSite(teamMissionControl);
    assert.match(board, /scope=\{scope\}/);
    assert.match(
      teamMissionControl,
      /<TeamMissionBoard[\s\S]*?scope=\{scope\}/,
    );
    // The scope now belongs to the hook, not to the active board alone.
    assert.ok(
      !teamMissionBoard.includes("scopePaths"),
      "team-mission-board must not rebuild a scope of its own",
    );
  });

  it("sweeps the archive over its own prop and narrows through useMcScope", () => {
    assert.match(missionControlArchived, /useMissionControlArchived\(agents\)/);
    assert.match(
      missionControlArchived,
      /useMcScope\(agents, data\.items, scope\)/,
    );
    assert.ok(
      !missionControlArchived.includes("useMissionControlArchived(scoped"),
      "the sweep must never receive a scoped slice",
    );
  });

  it("scoping narrows the output without changing the swept roster", () => {
    const roster = [agent("a"), agent("b"), agent("c")];
    const items = [card("1", "a"), card("2", "b"), card("3", "c")];
    const scopePaths = ["b"];

    // What a team RENDERS is a strict subset...
    assert.deepEqual(agentsInScope(roster, scopePaths), [agent("b")]);
    assert.deepEqual(
      itemsInScope(items, scopePaths).map((i) => i.id),
      ["2"],
    );

    // ...and the folder paths a scoped board would key a query on are NOT the
    // roster's. That difference is exactly the second query key the bug minted.
    const scopedPaths = agentsInScope(roster, scopePaths).map(
      (a) => a.folderPath,
    );
    const rosterPaths = roster.map((a) => a.folderPath);
    assert.notDeepEqual(scopedPaths, rosterPaths);
    assert.deepEqual(agentsInScope(roster, undefined), roster);
  });
});

/**
 * HOU-1165: there is ONE shell detail panel. Every surface that can portal a
 * chat into it must let go when its screen hides, or a team archive left with
 * a mission open keeps rendering over the next view.
 */
describe("the archive releases the shell detail panel", () => {
  it("clears its selection and closes the panel when its screen hides", () => {
    assert.match(
      missionControlArchived,
      /useIsActiveView\}? ?\} from "\.\.\/shell\/keep-alive-views"/,
    );
    assert.match(
      missionControlArchived,
      /const isActive = useIsActiveView\(\)/,
    );
    assert.match(
      missionControlArchived,
      /if \(isActive\) return;\s*data\.setSelectedId\(null\);\s*setPanelOpen\(false\);/,
    );
  });

  it("stops the active board's comment from claiming the archive too", () => {
    assert.ok(
      !teamMissionBoard.includes("already releases the shell detail panel"),
      "the active board covers only itself",
    );
    assert.match(teamMissionBoard, /archive carries its own release/);
  });
});

describe("a team's archive is named after the team", () => {
  it("passes the scope's title through, and only the team's agents to the filter", () => {
    assert.match(missionControlArchived, /title=\{scope\?\.title\}/);
    assert.match(missionControlArchived, /agents=\{scopedAgents\}/);
  });
});

describe("one agent grid, two doors", () => {
  it("has both agent lists delegate their populated case to the shared grid", () => {
    for (const source of [teamAgentsList, permissionsAgentsList]) {
      assert.match(source, /<PermissionsAgentGrid/);
      assert.ok(
        !source.includes("<CatalogSectionHeader"),
        "the section header belongs to the shared grid",
      );
      assert.ok(
        !source.includes("<PermissionsAgentRow"),
        "the rows belong to the shared grid",
      );
    }
  });

  it("gives the team's empty state a designed title and body", () => {
    assert.match(teamAgentsList, /<EmptyTitle>/);
    assert.match(teamAgentsList, /<EmptyDescription>/);
    assert.ok(
      !teamAgentsList.includes('<p className="text-sm text-ink-muted">'),
      "a bare paragraph is not a designed state",
    );
  });
});
