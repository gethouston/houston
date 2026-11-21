import type { Agent, OrgMember } from "@houston/engine-adapter";
import { currentAssignments } from "../agent/agent-access-model.ts";
import { agentHome } from "./org-chart-home.ts";
import {
  agentPeople,
  type ChartPerson,
  chartPerson,
} from "./org-chart-people.ts";

export interface OrgTreeAgent {
  id: string;
  name: string;
  role?: string;
  color?: string;
}

export interface OrgTreeBranch {
  person: ChartPerson;
  agents: OrgTreeAgent[];
  moreAgents: number;
}

export type OrgTreeRoot =
  | { kind: "company"; name: string }
  | { kind: "person"; person: ChartPerson };

export interface OrgTree {
  root: OrgTreeRoot;
  branches: OrgTreeBranch[];
  morePeople: number;
  rootAgents: OrgTreeAgent[];
  moreRootAgents: number;
  counts: { people: number; agents: number };
}

export interface OrgTreeCaps {
  people: number;
  agentsPerPerson: number;
  rootAgents: number;
}

export const SCREEN_TREE_CAPS: OrgTreeCaps = {
  people: 24,
  agentsPerPerson: 8,
  rootAgents: 24,
};

const ROLE_RANK = { owner: 0, admin: 1, user: 2 } as const;

const byRoleThenName = (a: ChartPerson, b: ChartPerson) =>
  ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name);

const byName = (a: OrgTreeAgent, b: OrgTreeAgent) =>
  a.name.localeCompare(b.name);

function treeAgent(agent: Agent): OrgTreeAgent {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role?.trim() || undefined,
    color: agent.color,
  };
}

function keepBranches(
  branches: readonly OrgTreeBranch[],
  cap: number,
): OrgTreeBranch[] {
  if (branches.length <= cap) return [...branches];
  const rank = (b: OrgTreeBranch) =>
    b.person.role === "owner" ? 0 : b.agents.length > 0 ? 1 : 2;
  const order = [...branches].sort((a, b) => rank(a) - rank(b));
  const kept = new Set(order.slice(0, Math.max(0, cap)));
  return branches.filter((branch) => kept.has(branch));
}

function capAgents(agents: readonly OrgTreeAgent[], cap: number) {
  const shown = agents.slice(0, Math.max(0, cap));
  return { shown, more: agents.length - shown.length };
}

export function buildOrgTree(
  input: {
    agents: readonly Agent[];
    members: readonly OrgMember[];
    name: string;
    personal: boolean;
    unnamedAccount: string;
  },
  caps: OrgTreeCaps,
): OrgTree {
  const roster = input.members
    .map((member) => chartPerson(member, input.unnamedAccount))
    .sort(byRoleThenName);
  const agents = input.agents.map(treeAgent).sort(byName);

  if (input.personal) {
    const self = roster.find((p) => p.role === "owner") ?? roster[0];
    const { shown, more } = capAgents(agents, caps.rootAgents);
    return {
      root: self
        ? { kind: "person", person: self }
        : { kind: "company", name: input.name },
      branches: [],
      morePeople: 0,
      rootAgents: shown,
      moreRootAgents: more,
      counts: { people: self ? 1 : 0, agents: agents.length },
    };
  }

  const homed = new Map<string, OrgTreeAgent[]>();
  const homeless: OrgTreeAgent[] = [];
  const byId = new Map(input.agents.map((agent) => [agent.id, agent]));
  for (const agent of agents) {
    const source = byId.get(agent.id);
    const people = source
      ? agentPeople(source, input.members, input.unnamedAccount)
      : null;
    const home = agentHome(
      people,
      roster,
      source ? currentAssignments(source) : [],
    );
    if (home === null) homeless.push(agent);
    else homed.set(home, [...(homed.get(home) ?? []), agent]);
  }

  const all = roster.map((person) => ({
    person,
    agents: homed.get(person.userId) ?? [],
    moreAgents: 0,
  }));
  const kept = keepBranches(all, caps.people);
  const branches = kept.map((branch) => {
    const { shown, more } = capAgents(branch.agents, caps.agentsPerPerson);
    return { ...branch, agents: shown, moreAgents: more };
  });
  const root = capAgents(homeless, caps.rootAgents);
  const dropped = all.filter((branch) => !kept.includes(branch));
  return {
    root: { kind: "company", name: input.name },
    branches,
    morePeople: dropped.length,
    rootAgents: root.shown,
    moreRootAgents: root.more,
    counts: { people: roster.length, agents: agents.length },
  };
}
