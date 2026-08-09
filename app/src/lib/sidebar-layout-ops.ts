import type { SidebarLayout } from "@houston-ai/engine-client";

import { blankOverlayGroup } from "./sidebar-layout-group-ops.ts";

export {
  type ExpandOnlyTeam,
  expandOnlyTeamOp,
} from "./sidebar-layout-accordion.ts";
export {
  setDefaultContextOp,
  toggleDefaultCollapsedOp,
} from "./sidebar-layout-default-ops.ts";
export {
  blankOverlayGroup,
  createGroupOp,
  deleteGroupOp,
  renameGroupOp,
  setGroupContextOp,
  setGroupIdentityOp,
  toggleGroupCollapsedOp,
} from "./sidebar-layout-group-ops.ts";
export {
  DEFAULT_SIDEBAR_LAYOUT,
  normalizeSidebarLayout,
} from "./sidebar-layout-normalize.ts";

/** Where a moved item lands: a target group (`null` = default section) and the
 *  sibling to insert before (`null` = append to that section). */
export interface ItemDest {
  groupId: string | null;
  beforeItemId: string | null;
}

/** Insert `id` into `list` before `beforeId` (null = append). `id` is assumed
 *  already absent from `list` (callers strip it first). */
function insertBefore(
  list: string[],
  id: string,
  beforeId: string | null,
): string[] {
  if (beforeId === null) return [...list, id];
  const idx = list.indexOf(beforeId);
  if (idx === -1) return [...list, id];
  return [...list.slice(0, idx), id, ...list.slice(idx)];
}

/** Replace an agent id in-place after a folder-backed rename. Existing copies
 * of the new id are removed so the layout remains duplicate-free. */
export function remapAgentIdOp(
  layout: SidebarLayout,
  oldId: string,
  newId: string,
): SidebarLayout {
  if (oldId === newId) return layout;
  const hasOldId =
    layout.groups.some((group) => group.agentIds.includes(oldId)) ||
    layout.ungroupedOrder.includes(oldId);
  if (!hasOldId) return layout;
  const lists = [
    ...layout.groups.map((group) => group.agentIds),
    layout.ungroupedOrder,
  ];
  const winnerListIndex = lists.findIndex((ids) => ids.includes(oldId));
  const remap = (ids: string[], listIndex: number) =>
    ids.flatMap((id) => {
      if (id === newId) return [];
      if (id === oldId) return listIndex === winnerListIndex ? [newId] : [];
      return [id];
    });
  return {
    ...layout,
    groups: layout.groups.map((group, index) => ({
      ...group,
      agentIds: remap(group.agentIds, index),
    })),
    ungroupedOrder: remap(layout.ungroupedOrder, layout.groups.length),
  };
}

/**
 * Move an agent to `dest`, removing it from wherever it currently lives (any
 * group's `agentIds` and `ungroupedOrder`) before inserting it once.
 *
 * A `dest.groupId` the layout does not hold UPSERTS: the group is appended
 * blank and the agent lands inside it. The old fallback (drop it in
 * `ungroupedOrder`) was written for a layout that IS the model, where an
 * unknown id can only mean corruption. On a server-teams host the layout is an
 * ordering overlay keyed by server team id and starts empty, so an unknown id
 * is the NORMAL first drop into a team, and sending it to `ungroupedOrder`
 * there means recording nothing at all: nothing reads that list on that
 * backend, so the drop position is lost. Locally every rail team is a stored
 * group, so this branch never fires and the section maths is untouched.
 */
export function moveItemOp(
  layout: SidebarLayout,
  agentId: string,
  dest: ItemDest,
): SidebarLayout {
  const groups = layout.groups.map((g) => ({
    ...g,
    agentIds: g.agentIds.filter((a) => a !== agentId),
  }));
  let ungroupedOrder = layout.ungroupedOrder.filter((a) => a !== agentId);

  if (dest.groupId === null) {
    ungroupedOrder = insertBefore(ungroupedOrder, agentId, dest.beforeItemId);
  } else {
    let target = groups.find((g) => g.id === dest.groupId);
    if (!target) {
      target = blankOverlayGroup(dest.groupId);
      groups.push(target);
    }
    target.agentIds = insertBefore(target.agentIds, agentId, dest.beforeItemId);
  }

  return { ...layout, groups, ungroupedOrder };
}

/** Reorder a group before `beforeGroupId` (null = move to the end). No-op if
 *  the group id is unknown. */
export function moveGroupOp(
  layout: SidebarLayout,
  groupId: string,
  beforeGroupId: string | null,
): SidebarLayout {
  const moving = layout.groups.find((g) => g.id === groupId);
  if (!moving) return layout;
  const rest = layout.groups.filter((g) => g.id !== groupId);
  if (beforeGroupId === null) return { ...layout, groups: [...rest, moving] };
  const idx = rest.findIndex((g) => g.id === beforeGroupId);
  if (idx === -1) return { ...layout, groups: [...rest, moving] };
  return {
    ...layout,
    groups: [...rest.slice(0, idx), moving, ...rest.slice(idx)],
  };
}
