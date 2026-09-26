import type {
  SidebarGroupView,
  SidebarRootEntry,
  SidebarSection,
} from "./sidebar-groups";

/**
 * The rail as ONE flat list, the model a sortable tree drags on: every visible
 * row in display order, each knowing whether it sits inside a group. A drag is
 * a reorder of this list plus the dragged row's depth, and the arrangement
 * written back is read straight off the result, so what the ghost shows while
 * dragging is exactly what the drop stores.
 */
export type SidebarTreeRow =
  | { kind: "agent"; id: string; parentId: string | null }
  | { kind: "group"; id: string; collapsed: boolean };

/** What a drop stores: the top-level sequence and every group's members. */
export interface SidebarArrangement {
  order: SidebarRootEntry[];
  members: Record<string, string[]>;
}

export const treeRowKey = (row: SidebarTreeRow) => `${row.kind}:${row.id}`;

/**
 * Flatten sections into rows. Members of a collapsed group are not rows (they
 * are not on screen). A dragged group's own members are hidden while its
 * header moves, keeping other groups' geometry stable.
 */
export function flattenSidebar(
  sections: SidebarSection[],
  hideMembersForGroup: string | null = null,
): SidebarTreeRow[] {
  const rows: SidebarTreeRow[] = [];
  for (const section of sections) {
    if (section.rootAgentId) {
      rows.push({ kind: "agent", id: section.rootAgentId, parentId: null });
      continue;
    }
    const group = section.group;
    if (!group) continue;
    rows.push({ kind: "group", id: group.id, collapsed: group.collapsed });
    if (group.collapsed || group.id === hideMembersForGroup) continue;
    for (const item of section.items)
      rows.push({ kind: "agent", id: item.id, parentId: group.id });
  }
  return rows;
}

const depthOf = (row: SidebarTreeRow | undefined) =>
  row?.kind === "agent" && row.parentId !== null ? 1 : 0;

/**
 * The list after moving `activeKey` onto `overKey`'s slot, with the moved row's
 * depth decided by where it landed and how far it was dragged sideways
 * (`depthDelta`, whole indent steps). Neighbours bound the depth: under an open
 * group header or a member it MAY go inside, above a member it MUST (the member
 * run is contiguous), anywhere else it sits at the top level. A collapsed
 * header takes an agent only when it is dragged right onto it: stepping past a
 * fold must never hide the row. A group only reorders.
 */
export function projectSidebarDrop(
  rows: SidebarTreeRow[],
  activeKey: string,
  overKey: string,
  depthDelta: number,
): SidebarTreeRow[] | null {
  const from = rows.findIndex((row) => treeRowKey(row) === activeKey);
  const to = rows.findIndex((row) => treeRowKey(row) === overKey);
  if (from < 0 || to < 0) return null;
  if (from === to && depthDelta === 0) return rows;
  const moved = [...rows];
  const [active] = moved.splice(from, 1);
  if (active.kind === "group") {
    const target = rows[to];
    const targetGroupId = target.kind === "group" ? target.id : target.parentId;
    if (targetGroupId !== null && targetGroupId !== active.id) {
      const header = moved.findIndex(
        (row) => row.kind === "group" && row.id === targetGroupId,
      );
      let end = header;
      while (true) {
        const next = moved[end + 1];
        if (next?.kind !== "agent" || next.parentId !== targetGroupId) break;
        end++;
      }
      moved.splice(from < to ? end + 1 : header, 0, active);
      return moved;
    }
  }
  moved.splice(to, 0, active);
  if (active.kind === "group") return moved;
  const prev = moved[to - 1];
  const next = moved[to + 1];
  const max =
    prev?.kind === "group"
      ? !prev.collapsed || depthDelta > 0
        ? 1
        : 0
      : depthOf(prev);
  const min = depthOf(next);
  const depth = Math.max(min, Math.min(max, depthOf(active) + depthDelta));
  const parentId =
    depth === 0 || !prev
      ? null
      : prev.kind === "group"
        ? prev.id
        : prev.parentId;
  moved[to] = { kind: "agent", id: active.id, parentId };
  return moved;
}

export type SidebarKeyboardDirection = "up" | "down" | "left" | "right";

/** One keyboard action through the same slot and depth projection as a drop. */
export function keyboardSidebarStep(
  rows: SidebarTreeRow[],
  activeKey: string,
  direction: SidebarKeyboardDirection,
): SidebarTreeRow[] | null {
  const index = rows.findIndex((row) => treeRowKey(row) === activeKey);
  if (index < 0) return null;
  const active = rows[index];
  if (direction === "left" || direction === "right") {
    if (active.kind === "group") return null;
    return projectSidebarDrop(
      rows,
      activeKey,
      activeKey,
      direction === "right" ? 1 : -1,
    );
  }
  let target = index + (direction === "down" ? 1 : -1);
  if (active.kind === "group" && direction === "down") {
    while (true) {
      const next = rows[target];
      if (next?.kind !== "agent" || next.parentId !== active.id) break;
      target++;
    }
  }
  if (target < 0 || target >= rows.length) return null;
  return projectSidebarDrop(rows, activeKey, treeRowKey(rows[target]), 0);
}

/**
 * Read the stored arrangement off a row list. Members that are not rows (a
 * collapsed group's, or the dragged group's) keep their
 * place: they come from `hiddenMembers`, followed by any agent dropped into
 * that group.
 */
export function arrangementFromRows(
  rows: SidebarTreeRow[],
  hiddenMembers: Record<string, string[]>,
): SidebarArrangement {
  const placed = new Set(
    rows.filter((row) => row.kind === "agent").map((row) => row.id),
  );
  const order: SidebarRootEntry[] = [];
  const members: Record<string, string[]> = {};
  for (const row of rows) {
    if (row.kind === "group") {
      order.push({ kind: "group", id: row.id });
      members[row.id] = (hiddenMembers[row.id] ?? []).filter(
        (id) => !placed.has(id),
      );
    } else if (row.parentId === null) {
      order.push({ kind: "agent", id: row.id });
    } else {
      members[row.parentId]?.push(row.id);
    }
  }
  return { order, members };
}

/** The group views a stored arrangement describes, identity untouched. */
export function groupsWithArrangement(
  groups: SidebarGroupView[],
  arrangement: SidebarArrangement,
): SidebarGroupView[] {
  return groups.map((group) => ({
    ...group,
    itemIds: arrangement.members[group.id] ?? group.itemIds,
  }));
}
