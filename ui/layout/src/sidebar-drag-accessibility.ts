import type { DndContext } from "@dnd-kit/core";
import type { ComponentProps } from "react";
import type { SidebarGroupView } from "./sidebar-groups";
import { DEFAULT_SIDEBAR_LABELS, type SidebarLabels } from "./sidebar-labels";
import type { SidebarItem } from "./sidebar-props";
import type { SidebarTreeRow } from "./sidebar-tree";
import { treeRowKey } from "./sidebar-tree";

type Accessibility = NonNullable<
  ComponentProps<typeof DndContext>["accessibility"]
>;

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/%([a-z]+)%/g, (match, key: string) => values[key] ?? match);

export function createSidebarAccessibility(
  items: SidebarItem[],
  groups: SidebarGroupView[],
  supplied: SidebarLabels = {},
): Accessibility {
  const labels = { ...DEFAULT_SIDEBAR_LABELS, ...supplied };
  const names = new Map<string, string>([
    ...items.map((item) => [`agent:${item.id}`, item.name] as const),
    ...groups.map((group) => [`group:${group.id}`, group.name] as const),
  ]);
  const name = (id: string | number) => names.get(String(id)) ?? String(id);
  const withName = (template: string, id: string | number) =>
    fill(template, { name: name(id) });
  const withTarget = (
    template: string,
    active: string | number,
    over: string | number | null,
  ) =>
    over === null
      ? undefined
      : fill(template, { name: name(active), over: name(over) });
  return {
    screenReaderInstructions: { draggable: labels.dragInstructions },
    announcements: {
      onDragStart: ({ active }) => withName(labels.dragPickedUp, active.id),
      onDragOver: ({ active, over }) =>
        withTarget(labels.dragMovedOver, active.id, over?.id ?? null),
      onDragEnd: ({ active, over }) =>
        withTarget(labels.dragDropped, active.id, over?.id ?? null),
      onDragCancel: ({ active }) => withName(labels.dragCancelled, active.id),
    },
  };
}

const parentOf = (rows: SidebarTreeRow[], key: string) => {
  const row = rows.find((candidate) => treeRowKey(candidate) === key);
  return row?.kind === "agent" ? row.parentId : null;
};

/** The row's 1-based slot among its siblings: its group's members, or the
 *  top-level rows (groups and ungrouped agents). */
function positionOf(
  rows: SidebarTreeRow[],
  key: string,
  parentId: string | null,
) {
  const siblings = rows.filter((row) =>
    row.kind === "group" ? parentId === null : row.parentId === parentId,
  );
  return String(siblings.findIndex((row) => treeRowKey(row) === key) + 1);
}

/** What a keyboard move says: the group it entered or left, or its new slot
 *  inside its group or at the top level. */
export function keyboardMoveAnnouncement(
  before: SidebarTreeRow[],
  after: SidebarTreeRow[],
  activeKey: string,
  items: SidebarItem[],
  groups: SidebarGroupView[],
  supplied: SidebarLabels = {},
): string {
  const labels = { ...DEFAULT_SIDEBAR_LABELS, ...supplied };
  const names = new Map<string, string>([
    ...items.map((item) => [`agent:${item.id}`, item.name] as const),
    ...groups.map((group) => [`group:${group.id}`, group.name] as const),
  ]);
  const groupName = (id: string) => names.get(`group:${id}`) ?? id;
  const name = names.get(activeKey) ?? activeKey;
  const from = parentOf(before, activeKey);
  const to = parentOf(after, activeKey);
  if (to !== null && to !== from)
    return fill(labels.dragKeyboardEnteredGroup, {
      name,
      group: groupName(to),
    });
  if (from !== null && to === null)
    return fill(labels.dragKeyboardLeftGroup, { name, group: groupName(from) });
  const position = positionOf(after, activeKey, to);
  return to === null
    ? fill(labels.dragKeyboardMoved, { name, position })
    : fill(labels.dragKeyboardMovedInGroup, {
        name,
        position,
        group: groupName(to),
      });
}
