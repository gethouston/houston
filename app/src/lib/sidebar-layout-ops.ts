import type { SidebarGroup, SidebarLayout } from "@houston-ai/engine-client";

/** The layout an unset/corrupt `sidebar_layout` preference reads as. */
export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  groups: [],
  ungroupedOrder: [],
};

/** Where a moved item lands: a target group (`null` = default section) and the
 *  sibling to insert before (`null` = append to that section). */
export interface ItemDest {
  groupId: string | null;
  beforeItemId: string | null;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Coerce an untrusted value (a query-cache read, a server payload, a
 * cross-version or partially-written layout) into a guaranteed-complete
 * `SidebarLayout`. Any missing/wrong-typed field falls back to its default and
 * malformed groups are dropped, so the sidebar can NEVER crash on a bad layout
 * (`layout.groups.map` was blowing up when a non-layout value slipped through a
 * `?? DEFAULT` guard that only catches null/undefined, not a truthy partial).
 * Every client read of the layout goes through this.
 */
export function normalizeSidebarLayout(raw: unknown): SidebarLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_SIDEBAR_LAYOUT;
  }
  const r = raw as Record<string, unknown>;
  const groups: SidebarGroup[] = Array.isArray(r.groups)
    ? r.groups.flatMap((g) => {
        if (!g || typeof g !== "object" || Array.isArray(g)) return [];
        const gr = g as Record<string, unknown>;
        if (
          typeof gr.id !== "string" ||
          typeof gr.name !== "string" ||
          typeof gr.collapsed !== "boolean" ||
          !isStringArray(gr.agentIds) ||
          (gr.context !== undefined && typeof gr.context !== "string")
        )
          return [];
        return [
          {
            id: gr.id,
            name: gr.name,
            collapsed: gr.collapsed,
            agentIds: gr.agentIds,
            ...(gr.context !== undefined ? { context: gr.context } : {}),
          },
        ];
      })
    : [];
  const ungroupedOrder = isStringArray(r.ungroupedOrder)
    ? r.ungroupedOrder
    : [];
  return { groups, ungroupedOrder };
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

/** Set a group's shared context, injected into every member agent's system
 *  prompt as `GROUP.md` (no-op if the id is unknown). */
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

/** Delete a group; its members fall back to the default section (appended to
 *  `ungroupedOrder` so manual order is preserved). */
export function deleteGroupOp(
  layout: SidebarLayout,
  id: string,
): SidebarLayout {
  const target = layout.groups.find((g) => g.id === id);
  if (!target) return layout;
  const freed = target.agentIds.filter(
    (a) => !layout.ungroupedOrder.includes(a),
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

/** Move an agent to `dest`, removing it from wherever it currently lives (any
 *  group's `agentIds` and `ungroupedOrder`) before inserting it once. */
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
    const target = groups.find((g) => g.id === dest.groupId);
    // Unknown target group: fall back to the default section rather than
    // dropping the agent from every section.
    if (!target) {
      ungroupedOrder = insertBefore(ungroupedOrder, agentId, dest.beforeItemId);
    } else {
      target.agentIds = insertBefore(
        target.agentIds,
        agentId,
        dest.beforeItemId,
      );
    }
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
