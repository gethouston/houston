import type { SidebarGroup, SidebarLayout } from "@houston-ai/engine-client";
import type { Agent } from "./types";

/** One resolved named group: the stored group plus its member agents in drag
 *  order. */
export interface ResolvedGroupSection {
  group: SidebarGroup;
  agents: Agent[];
}

/** The sidebar partitioned into named groups (display order) plus the trailing
 *  default (ungrouped) section. */
export interface ResolvedSidebar {
  groups: ResolvedGroupSection[];
  ungrouped: Agent[];
}

/** Order a section's agents by a stored id list: known ids first (in that
 *  order), then any remaining agents stably in their incoming order (a
 *  brand-new agent lands at the end). */
function orderBy(section: Agent[], order: string[]): Agent[] {
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const known = section
    .filter((a) => rank.has(a.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const fresh = section.filter((a) => !rank.has(a.id));
  return [...known, ...fresh];
}

/**
 * Partition agents into the sidebar's named groups plus the trailing default
 * section, each in its stored drag order. Ordering is always manual.
 *
 * Stale ids (a group/`ungroupedOrder` entry with no live agent) are dropped;
 * an agent listed in more than one group lands in the first. Agents in no group
 * are the default section; brand-new agents fall to the end of it. Sidebar
 * rendering and ⌘[ / ⌘] cycling both derive from this so keyboard order ==
 * visible order.
 */
export function resolveSidebarSections(
  agents: Agent[],
  layout: SidebarLayout,
): ResolvedSidebar {
  const layoutGroups = Array.isArray(layout?.groups) ? layout.groups : [];
  const ungroupedOrder = Array.isArray(layout?.ungroupedOrder)
    ? layout.ungroupedOrder
    : [];
  const byId = new Map(agents.map((a) => [a.id, a] as const));
  const grouped = new Set<string>();

  const groups: ResolvedGroupSection[] = layoutGroups.map((group) => {
    const agentIds = Array.isArray(group?.agentIds) ? group.agentIds : [];
    const members: Agent[] = [];
    for (const id of agentIds) {
      const agent = byId.get(id);
      if (agent && !grouped.has(id)) {
        grouped.add(id);
        members.push(agent);
      }
    }
    return { group, agents: orderBy(members, agentIds) };
  });

  const ungrouped = orderBy(
    agents.filter((a) => !grouped.has(a.id)),
    ungroupedOrder,
  );

  return { groups, ungrouped };
}

/**
 * The flat visible order of every agent (groups in display order, each section
 * in drag order, default section last). Feeds ⌘[ / ⌘] cycling and the command
 * palette so their order matches the sidebar.
 */
export function flatSidebarOrder(
  agents: Agent[],
  layout: SidebarLayout,
): Agent[] {
  const resolved = resolveSidebarSections(agents, layout);
  return [...resolved.groups.flatMap((g) => g.agents), ...resolved.ungrouped];
}
