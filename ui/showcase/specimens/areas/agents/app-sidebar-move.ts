import type { SidebarGroupView, SidebarItem } from "@houston-ai/layout";

/**
 * The reordering the shell owns.
 *
 * `AppSidebar` is fully controlled for drag-and-drop: it reports where an agent
 * or a group was dropped and renders whatever comes back. A specimen that
 * ignored `onMoveItem` would show rows snapping back on every drop and quietly
 * misrepresent the component, so these are the same three moves the desktop
 * shell performs — kept pure, and kept out of the page.
 */

/** Drop `itemId` into `groupId` (null = the ungrouped section), before
 *  `beforeItemId` (null = append). Removing it from every group first is what
 *  makes a drag *out* of a group work. */
export function moveItemToGroup(
  groups: SidebarGroupView[],
  itemId: string,
  dest: { groupId: string | null; beforeItemId: string | null },
): SidebarGroupView[] {
  const without = groups.map((group) => ({
    ...group,
    itemIds: group.itemIds.filter((id) => id !== itemId),
  }));
  if (dest.groupId === null) return without;
  return without.map((group) => {
    if (group.id !== dest.groupId) return group;
    const next = [...group.itemIds];
    const at = dest.beforeItemId ? next.indexOf(dest.beforeItemId) : -1;
    next.splice(at < 0 ? next.length : at, 0, itemId);
    return { ...group, itemIds: next };
  });
}

/** Reorder the ungrouped section, whose order is the `items` array's own. */
export function moveItemInList(
  items: SidebarItem[],
  itemId: string,
  beforeItemId: string | null,
): SidebarItem[] {
  const moved = items.find((item) => item.id === itemId);
  if (!moved) return items;
  const rest = items.filter((item) => item.id !== itemId);
  const at = beforeItemId
    ? rest.findIndex((item) => item.id === beforeItemId)
    : -1;
  rest.splice(at < 0 ? rest.length : at, 0, moved);
  return rest;
}

/** Reorder the groups themselves: `groupId` lands before `beforeGroupId`. */
export function moveGroup(
  groups: SidebarGroupView[],
  groupId: string,
  beforeGroupId: string | null,
): SidebarGroupView[] {
  const moved = groups.find((group) => group.id === groupId);
  if (!moved) return groups;
  const rest = groups.filter((group) => group.id !== groupId);
  const at = beforeGroupId
    ? rest.findIndex((group) => group.id === beforeGroupId)
    : -1;
  rest.splice(at < 0 ? rest.length : at, 0, moved);
  return rest;
}
