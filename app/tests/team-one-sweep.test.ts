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
const teamView = read("../src/components/team-view/team-view.tsx");
const teamContextPane = read(
  "../src/components/team-view/team-context-pane.tsx",
);
const teamPeoplePane = read("../src/components/team-view/team-people-pane.tsx");
const createOrganizationInviteEmpty = read(
  "../src/components/organization/create-organization-invite-empty.tsx",
);
const agentSettingsPane = read(
  "../src/components/team-view/agent-settings-pane.tsx",
);
// The archive is its OWN section now, not a mode of the Tasks one.
const teamArchived = read("../src/components/team-view/team-archived.tsx");

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
    // The element's FIRST prop is the sweep roster. Scanning the whole call
    // site would catch `scopedAgents` (the "New task" menu's roster) and the
    // filter capsule's own `agents`, which are the team's slice on purpose.
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
    // Its own filter SOURCE, the same scope shape: the one-sweep rule is
    // about the paths and the query key, and neither moved.
    assert.match(teamArchived, /useTeamScope\(team, filterAgentId\)/);
    // That source is the section's OWN state, never the team-wide pin:
    // narrowing finished work must not narrow the board the user goes back to.
    assert.match(
      teamArchived,
      /const \[filterAgentId, setFilterAgentId\] = useState<string \| null>\(null\)/,
    );
    assert.ok(
      !teamArchived.includes("teamAgentFilter"),
      "the archive's filter is its own, never the team-wide pin",
    );
  });

  it("shares one scope object between the team's two board sections", () => {
    // Two SECTIONS now rather than two modes of one, so the thing that keeps
    // them on one sweep is that both build the scope from the same hook over
    // the same full roster — not that they share a parent.
    assert.match(archivedCallSite(teamArchived), /scope=\{scope\}/);
    assert.match(
      teamMissionControl,
      /<TeamMissionBoard[\s\S]*?scope=\{scope\}/,
    );
    // The BOARD is the one surface still keyed on the team-wide pin.
    assert.match(teamMissionControl, /useTeamBoardScope\(team, agentFocusId\)/);
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
    assert.match(teamMissionBoard, /Archived SECTION carries its own release/);
  });
});

describe("a team's archive names nothing: the lit tab already did", () => {
  it("hands the toolbar no title and no roster", () => {
    // Row 1 of the team frame (`TeamChrome`) names the team above every one of
    // its sections, and the Archived TAB says which section is up, so a board
    // that titled itself printed the same words twice on one screen.
    assert.ok(
      !missionControlArchived.includes("title={scope?.title}"),
      "the team frame owns the team's name, not the board",
    );
    assert.ok(
      !missionControlArchived.includes("agents={scopedAgents}"),
      "the agent scope is the strip's crumb, not the archive's toolbar",
    );
    // It still NARROWS through the one shared scope — that never moved.
    assert.match(
      missionControlArchived,
      /useMcScope\(agents, data\.items, scope\)/,
    );
  });
});

describe("team and focused-agent composition", () => {
  it("routes team configuration to Context and People panes", () => {
    assert.match(teamView, /<TeamContextPane team=\{team\}/);
    assert.match(teamView, /<TeamPeoplePane team=\{team\} face=\{peopleFace\}/);
    assert.match(teamContextPane, /<TeamContextCard team=\{team\}/);
    assert.match(teamPeoplePane, /<TeamMembersCard team=\{team\}/);
    assert.match(teamPeoplePane, /<CreateOrganizationInviteEmpty \/>/);
    assert.match(createOrganizationInviteEmpty, /<EmptyTitle>/);
  });

  it("routes focused settings directly to AgentDetail", () => {
    assert.match(teamView, /<AgentSettingsPane team=\{team\} agent=\{agent\}/);
    assert.match(agentSettingsPane, /<AgentDetail/);
    assert.match(agentSettingsPane, /agentFilter: agent\.id/);
    assert.match(agentSettingsPane, /agentFocus: true/);
  });
});
