import type { SidebarLayout } from "@houston-ai/engine-client";

/** Append a new, empty, expanded group with a caller-minted id. */
export function createGroupOp(
  layout: SidebarLayout,
  id: string,
  name: string,
): SidebarLayout {
  return {
    ...layout,
    groups: [...layout.groups, { id, name, collapsed: false, agentIds: [] }],
  };
}

/** Rename a group (no-op if the id is unknown). */
export function renameGroupOp(
  layout: SidebarLayout,
  id: string,
  name: string,
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === id ? { ...g, name } : g)),
  };
}

/** Set a group's shared context, injected into every member agent's prompt. */
export function setGroupContextOp(
  layout: SidebarLayout,
  id: string,
  context: string,
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === id ? { ...g, context } : g)),
  };
}

/** Delete a group and append its members to the default section. */
export function deleteGroupOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  const target = layout.groups.find((g) => g.id === id);
  if (!target) return layout;
  const freed = target.agentIds.filter(
    (agentId) => !layout.ungroupedOrder.includes(agentId),
  );
  return {
    ...layout,
    groups: layout.groups.filter((g) => g.id !== id),
    ungroupedOrder: [...layout.ungroupedOrder, ...freed],
  };
}

/** Toggle a group's collapsed flag (no-op if the id is unknown). */
export function toggleGroupCollapsedOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) =>
      g.id === id ? { ...g, collapsed: !g.collapsed } : g,
    ),
  };
}
