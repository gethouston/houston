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
const agentView = read("../src/components/team-view/agent-view.tsx");
const agentSettingsPane = read(
  "../src/components/team-view/agent-settings-pane.tsx",
);
const teamArchived = read("../src/components/team-view/team-archived.tsx");

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

describe("one sweep, whatever the scope", () => {
  it("gives the team archive the full roster plus the shared scope", () => {
    assert.match(
      teamArchived,
      /<MissionControlArchived\s+agents=\{agents\}/,
      "the archive sweeps the FULL roster, never the team's slice",
    );
    const call = archivedCallSite(teamArchived);
    assert.match(call, /scope=\{scope\}/);
    assert.match(
      teamArchived,
      /useAgentStore\(\(s\) => s\.agents\)/,
      "the archive section must own the full roster",
    );
    assert.match(teamArchived, /useAgentBoardScope\(agent\)/);
  });

  it("shares one scope object between the team's two board sections", () => {
    assert.match(archivedCallSite(teamArchived), /scope=\{scope\}/);
    assert.match(
      teamMissionControl,
      /<TeamMissionBoard[\s\S]*?scope=\{scope\}/,
    );
    assert.match(teamMissionControl, /useAgentBoardScope\(agent\)/);
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

    assert.deepEqual(agentsInScope(roster, scopePaths), [agent("b")]);
    assert.deepEqual(
      itemsInScope(items, scopePaths).map((i) => i.id),
      ["2"],
    );

    const scopedPaths = agentsInScope(roster, scopePaths).map(
      (a) => a.folderPath,
    );
    const rosterPaths = roster.map((a) => a.folderPath);
    assert.notDeepEqual(scopedPaths, rosterPaths);
    assert.deepEqual(agentsInScope(roster, undefined), roster);
  });
});

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
});

describe("the employee archive header", () => {
  it("hands the toolbar no title and no roster", () => {
    assert.ok(
      !missionControlArchived.includes("title={scope?.title}"),
      "the team frame owns the team's name, not the board",
    );
    assert.ok(
      !missionControlArchived.includes("agents={scopedAgents}"),
      "the agent scope is the strip's crumb, not the archive's toolbar",
    );
    assert.match(
      missionControlArchived,
      /useMcScope\(agents, data\.items, scope\)/,
    );
  });
});

describe("employee screen composition", () => {
  it("routes employee settings directly to AgentDetail", () => {
    assert.match(agentView, /<AgentSettingsPane agent=\{agent\}/);
    assert.match(agentSettingsPane, /<AgentDetail/);
    assert.match(
      agentSettingsPane,
      /openAgentView\(agent\.id, "mission-control"\)/,
    );
  });
});
