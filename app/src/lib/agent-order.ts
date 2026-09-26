import type { SidebarGroup, SidebarLayout } from "@houston/engine-adapter";
import type { Agent } from "./types";

export interface ResolvedGroupSection {
  group: SidebarGroup;
  agents: Agent[];
}

export type ResolvedRootEntry =
  | { kind: "group"; section: ResolvedGroupSection }
  | { kind: "agent"; agent: Agent };

export interface ResolvedSidebar {
  entries: ResolvedRootEntry[];
  groups: ResolvedGroupSection[];
  ungrouped: Agent[];
}

export function resolveSidebarSections(
  agents: Agent[],
  layout: SidebarLayout,
): ResolvedSidebar {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const grouped = new Set<string>();
  const groups = layout.groups.map((group) => {
    const members: Agent[] = [];
    for (const id of group.agentIds) {
      const agent = byId.get(id);
      if (agent && !grouped.has(id)) {
        grouped.add(id);
        members.push(agent);
      }
    }
    return { group, agents: members };
  });
  const groupById = new Map(
    groups.map((section) => [section.group.id, section]),
  );
  const usedGroups = new Set<string>();
  const usedAgents = new Set<string>();
  const ordered: ResolvedRootEntry[] = [];
  for (const entry of layout.order) {
    if (entry.kind === "group") {
      const section = groupById.get(entry.id);
      if (section && !usedGroups.has(entry.id)) {
        ordered.push({ kind: "group", section });
        usedGroups.add(entry.id);
      }
    } else {
      const agent = byId.get(entry.id);
      if (agent && !grouped.has(entry.id) && !usedAgents.has(entry.id)) {
        ordered.push({ kind: "agent", agent });
        usedAgents.add(entry.id);
      }
    }
  }
  const fresh = agents
    .filter((agent) => !grouped.has(agent.id) && !usedAgents.has(agent.id))
    .map((agent): ResolvedRootEntry => ({ kind: "agent", agent }));
  const missingGroups = groups
    .filter(({ group }) => !usedGroups.has(group.id))
    .map((section): ResolvedRootEntry => ({ kind: "group", section }));
  const entries = [...fresh, ...ordered, ...missingGroups];
  return {
    entries,
    groups: entries.flatMap((entry) =>
      entry.kind === "group" ? [entry.section] : [],
    ),
    ungrouped: entries.flatMap((entry) =>
      entry.kind === "agent" ? [entry.agent] : [],
    ),
  };
}

export function flatSidebarOrder(
  agents: Agent[],
  layout: SidebarLayout,
): Agent[] {
  return resolveSidebarSections(agents, layout).entries.flatMap((entry) =>
    entry.kind === "agent" ? [entry.agent] : entry.section.agents,
  );
}

/** The employee the rail shows first: the desktop's landing. */
export function firstSidebarAgentId(
  agents: Agent[],
  layout: SidebarLayout,
): string | null {
  return flatSidebarOrder(agents, layout)[0]?.id ?? null;
}
