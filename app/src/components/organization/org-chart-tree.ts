import type { Agent, OrgMember, OrgRole } from "@houston/engine-adapter";
import { currentAssignments } from "../agent/agent-access-model.ts";
import { agentHome } from "./org-chart-home.ts";
import {
  agentPeople,
  type ChartPerson,
  chartPerson,
} from "./org-chart-people.ts";

/**
 * The org chart drawn as a tree: the space at the top, its people under it,
 * and under each person the AI Employees they are home to. Pure and
 * DOM-free; the on-screen chart and the share image both draw from it.
 *
 * Every owner manages every agent, so "who manages it" cannot place an
 * agent: it would hang every AI Employee under the owner. An agent's HOME is
 * the person explicitly assigned to manage it, by name when several match,
 * else its one user, else the first owner. Assignment rows carry no timestamp.
 * Agents whose people the caller cannot see home under the first owner.
 *
 * A personal space is one person, so its tree is that person over every AI
 * Employee, with no people row.
 */

export interface OrgTreeAgent {
  id: string;
  name: string;
  /** The role its job description names, when it has one. */
  role?: string;
  /** The stored agent color id (or legacy hex). */
  color?: string;
}

export interface OrgTreeBranch {
  person: ChartPerson;
  agents: OrgTreeAgent[];
  /** The person's AI Employees past the cap, drawn as "+N". */
  moreAgents: number;
}

export type OrgTreeRoot =
  | { kind: "company"; name: string }
  | { kind: "person"; person: ChartPerson };

export interface OrgTree {
  root: OrgTreeRoot;
  /** One per person shown, in roster order. Empty in a personal space. */
  branches: OrgTreeBranch[];
  /** People past the cap, drawn as "+N". */
  morePeople: number;
  /**
   * AI Employees hung straight off the root: a personal space's, or a
   * space's when nobody on the roster can be their home.
   */
  rootAgents: OrgTreeAgent[];
  moreRootAgents: number;
  /** The whole space, whatever the caps leave out. */
  counts: { people: number; agents: number };
}

/** How much of the tree a renderer can draw. */
export interface OrgTreeCaps {
  people: number;
  agentsPerPerson: number;
  rootAgents: number;
}

/** The on-screen chart scrolls sideways on desktop, so it holds a lot. */
export const SCREEN_TREE_CAPS: OrgTreeCaps = {
  people: 24,
  agentsPerPerson: 8,
  rootAgents: 24,
};

const ROLE_RANK: Record<OrgRole, number> = {
  owner: 0,
  admin: 1,
  partner: 2,
  user: 3,
};

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

/**
 * The people a capped row keeps: every owner first (the person sharing the
 * chart is never the one cut), then people with AI Employees, then the
 * rest, drawn in roster order.
 */
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
    /** The space's name. */
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
