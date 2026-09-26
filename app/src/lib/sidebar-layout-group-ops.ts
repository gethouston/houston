import type {
  SidebarGroup,
  SidebarLayout,
  SidebarRootEntry,
} from "@houston/engine-adapter";

/** Insert a new, empty group at a root position (the top by default). */
export function createGroupOp(
  layout: SidebarLayout,
  id: string,
  name: string,
  before: SidebarRootEntry | null = layout.order[0] ?? null,
): SidebarLayout {
  const found =
    before &&
    layout.order.findIndex(
      (entry) => entry.kind === before.kind && entry.id === before.id,
    );
  const index = found === null || found === -1 ? layout.order.length : found;
  return {
    ...layout,
    groups: [...layout.groups, { id, name, collapsed: false, agentIds: [] }],
    order: [
      ...layout.order.slice(0, index),
      { kind: "group", id },
      ...layout.order.slice(index),
    ],
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

/** Unset identity fields are omitted from the stored group. */
function withIdentity(
  group: SidebarGroup,
  patch: { icon?: string | null; color?: string | null },
): SidebarGroup {
  const { icon: _icon, color: _color, ...base } = group;
  const icon =
    patch.icon === undefined ? group.icon : (patch.icon ?? undefined);
  const color =
    patch.color === undefined ? group.color : (patch.color ?? undefined);
  return {
    ...base,
    ...(icon !== undefined ? { icon } : {}),
    ...(color !== undefined ? { color } : {}),
  };
}

/**
 * Set a group's glyph + color (no-op if the id is unknown, like
 * {@link renameGroupOp}).
 *
 * `null` clears a field, a string sets it, and an omitted field is untouched.
 */
export function setGroupIdentityOp(
  layout: SidebarLayout,
  groupId: string,
  patch: { icon?: string | null; color?: string | null },
): SidebarLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) =>
      g.id === groupId ? withIdentity(g, patch) : g,
    ),
  };
}

/** Delete a group and place its members at the group's root position. */
export function deleteGroupOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  const target = layout.groups.find((g) => g.id === id);
  if (!target) return layout;
  const freed = [...new Set(target.agentIds)].filter(
    (agentId) =>
      !layout.groups.some(
        (group) => group.id !== id && group.agentIds.includes(agentId),
      ),
  );
  const anchor = layout.order.findIndex(
    (entry) => entry.kind === "group" && entry.id === id,
  );
  const order = layout.order.filter(
    (entry) =>
      !(entry.kind === "group" && entry.id === id) &&
      !(entry.kind === "agent" && freed.includes(entry.id)),
  );
  const at =
    anchor < 0
      ? order.length
      : layout.order
          .slice(0, anchor)
          .filter(
            (entry) => entry.kind !== "agent" || !freed.includes(entry.id),
          ).length;
  return {
    ...layout,
    groups: layout.groups.filter((g) => g.id !== id),
    order: [
      ...order.slice(0, at),
      ...freed.map((agentId) => ({ kind: "agent" as const, id: agentId })),
      ...order.slice(at),
    ],
  };
}

/** Toggle a group's collapsed flag when it exists. */
export function toggleGroupCollapsedOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  if (!layout.groups.some((group) => group.id === id)) return layout;
  return {
    ...layout,
    groups: layout.groups.map((g) =>
      g.id === id ? { ...g, collapsed: !g.collapsed } : g,
    ),
  };
}
