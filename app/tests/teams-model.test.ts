import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities, SidebarLayout } from "@houston/engine-adapter";
import { flatSidebarOrder } from "../src/lib/agent-order.ts";
import {
  teamDisplayColor,
  teamDisplayIcon,
  teamDisplayName,
} from "../src/lib/team-display.ts";
import {
  AGENT_VIEW_ID,
  blockedAgentView,
  resolveTeamSection,
  resolveTeams,
  teamById,
  teamOfAgent,
  visibleAgentSections,
} from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string, access?: Agent["access"]): Agent =>
  ({ id, name: id, ...(access ? { access } : {}) }) as Agent;
const group = (id: string, agentIds: string[], over: object = {}) => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
  ...over,
});
const layout = (
  groups: SidebarLayout["groups"],
  rootAgents: string[] = [],
): SidebarLayout => ({
  groups,
  order: rootAgents.map((id) => ({ kind: "agent", id })),
});
const caps = (role: string): Capabilities =>
  ({ multiplayer: true, role }) as Capabilities;

describe("resolveTeams", () => {
  it("maps stored folders without inventing a catch-all team", () => {
    const agents = [agent("a"), agent("b"), agent("c")];
    const teams = resolveTeams(agents, layout([group("g", ["b"])], ["c", "a"]));
    assert.deepEqual(teams, [{ id: "g", name: "g", agents: [agents[1]] }]);
    assert.deepEqual(
      flatSidebarOrder(agents, layout([group("g", ["b"])], ["c", "a"])).map(
        (item) => item.id,
      ),
      ["c", "a", "b"],
    );
  });

  it("leaves newly created agents ungrouped", () => {
    const agents = [agent("existing"), agent("new")];
    const teams = resolveTeams(agents, layout([group("g", ["existing"])]));
    assert.equal(teamOfAgent(teams, "new"), null);
    assert.deepEqual(
      flatSidebarOrder(agents, layout([group("g", ["existing"])])).map(
        (item) => item.id,
      ),
      ["new", "existing"],
    );
  });

  it("assigns each agent to the first matching folder and drops unknown ids", () => {
    const teams = resolveTeams(
      [agent("a"), agent("b")],
      layout([group("first", ["a", "missing"]), group("second", ["a"])]),
    );
    assert.equal(teamOfAgent(teams, "a")?.id, "first");
    assert.equal(teamOfAgent(teams, "b"), null);
    assert.deepEqual(teams[1].agents, []);
  });

  it("copies optional identity only when it is stored", () => {
    const teams = resolveTeams(
      [],
      layout([
        group("first", [], { icon: "rocket", color: "ocean" }),
        group("second", []),
      ]),
    );
    assert.equal(teamDisplayIcon(teams[0]), "rocket");
    assert.equal(teamDisplayColor(teams[0]), "ocean");
    assert.equal(teamDisplayIcon(teams[1]), undefined);
    assert.equal(teamDisplayColor(teams[1]), undefined);
    assert.equal(teamDisplayName(teams[0]), "first");
  });

  it("resolves stored ids and agent membership", () => {
    const teams = resolveTeams([agent("a")], layout([group("g", ["a"])]));
    assert.equal(teamById(teams, "g"), teams[0]);
    assert.equal(teamById(teams, "missing"), null);
    assert.equal(teamOfAgent(teams, "a"), teams[0]);
  });
});

describe("agent sections", () => {
  it("adds agent settings only for a manager", () => {
    assert.deepEqual(visibleAgentSections(caps("user"), agent("a", "user")), [
      "mission-control",
      "routines",
      "files",
    ]);
    assert.deepEqual(
      visibleAgentSections(caps("user"), agent("a", "manager")),
      ["mission-control", "routines", "files", "settings"],
    );
  });

  it("keeps a visible section and falls back to the board for a hidden one", () => {
    const sections = visibleAgentSections(caps("user"), agent("a", "user"));
    assert.equal(resolveTeamSection(sections, "files"), "files");
    assert.equal(resolveTeamSection(sections, "settings"), "mission-control");
    assert.equal(resolveTeamSection(sections, null), "mission-control");
  });
});

describe("blockedAgentView", () => {
  const agents = [agent("a")];
  it("keeps an employee screen and unrelated views", () => {
    assert.equal(blockedAgentView(AGENT_VIEW_ID, "a", agents), false);
    assert.equal(blockedAgentView("dashboard", "missing", agents), false);
  });
  it("blocks a deleted employee or unset selection", () => {
    assert.equal(blockedAgentView(AGENT_VIEW_ID, "missing", agents), true);
    assert.equal(blockedAgentView(AGENT_VIEW_ID, null, agents), true);
  });
  it("does not depend on folder membership", () => {
    assert.equal(blockedAgentView(AGENT_VIEW_ID, "a", agents), false);
  });
});
