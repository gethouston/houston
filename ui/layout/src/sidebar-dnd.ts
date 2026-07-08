import type { SidebarSection } from "./sidebar-groups";

/**
 * Pure drag-and-drop helpers for the grouped sidebar (see
 * {@link SidebarGroupedList}). @dnd-kit needs every draggable/droppable to have
 * a unique string id, but agents, groups, and section containers can all share
 * name-spaces, so ids are prefixed here and decoded back to raw ids for the
 * app callbacks. A `null` container id is the trailing default (ungrouped)
 * section.
 */

export type ContainerId = string | null;

const DEFAULT_CONTAINER = "__default__";

export const itemDndId = (id: string) => `item:${id}`;
export const groupDndId = (id: string) => `grp:${id}`;
export const containerDndId = (c: ContainerId) =>
  `cont:${c ?? DEFAULT_CONTAINER}`;

export const rawItemId = (dndId: string): string | null =>
  dndId.startsWith("item:") ? dndId.slice(5) : null;

export const rawGroupId = (dndId: string): string | null =>
  dndId.startsWith("grp:") ? dndId.slice(4) : null;

const containerFromDndId = (dndId: string): ContainerId | undefined => {
  if (!dndId.startsWith("cont:")) return undefined;
  const c = dndId.slice(5);
  return c === DEFAULT_CONTAINER ? null : c;
};

/** The live working copy of the sections while a drag is in flight: just the
 *  container id + its ordered item ids (item content is looked up by id). */
export interface WorkingSection {
  groupId: ContainerId;
  itemIds: string[];
}

export function toWorkingSections(
  sections: SidebarSection[],
): WorkingSection[] {
  return sections.map((s) => ({
    groupId: s.groupId,
    itemIds: s.items.map((it) => it.id),
  }));
}

/** Which container currently holds `itemId` (or undefined if none). */
export function containerOfItem(
  sections: WorkingSection[],
  itemId: string,
): ContainerId | undefined {
  const s = sections.find((sec) => sec.itemIds.includes(itemId));
  return s ? s.groupId : undefined;
}

/**
 * Resolve any dnd id under the pointer (`over.id`) to the container it targets:
 * a container droppable id → that container; an item id → the container that
 * holds it. Returns undefined for anything else (e.g. a group header).
 */
export function containerOfOverId(
  sections: WorkingSection[],
  overDndId: string,
): ContainerId | undefined {
  const direct = containerFromDndId(overDndId);
  if (direct !== undefined || overDndId.startsWith("cont:")) return direct;
  const raw = rawItemId(overDndId);
  return raw === null ? undefined : containerOfItem(sections, raw);
}

/**
 * Move `itemId` into `targetContainer`, positioned before `overItemId` (or at
 * the end when `overItemId` is null / not found). Returns a NEW working-section
 * array (drops the item from wherever it was first, so it appears exactly once).
 */
export function moveItemInWorking(
  sections: WorkingSection[],
  itemId: string,
  targetContainer: ContainerId,
  overItemId: string | null,
): WorkingSection[] {
  return sections.map((sec) => {
    const withoutItem = sec.itemIds.filter((id) => id !== itemId);
    if (sec.groupId !== targetContainer) {
      return withoutItem.length === sec.itemIds.length
        ? sec
        : { ...sec, itemIds: withoutItem };
    }
    if (overItemId === null || overItemId === itemId) {
      return { ...sec, itemIds: [...withoutItem, itemId] };
    }
    const idx = withoutItem.indexOf(overItemId);
    if (idx === -1) return { ...sec, itemIds: [...withoutItem, itemId] };
    return {
      ...sec,
      itemIds: [
        ...withoutItem.slice(0, idx),
        itemId,
        ...withoutItem.slice(idx),
      ],
    };
  });
}

/** Structural equality of two working-section arrays (container + item order),
 *  used to skip no-op state updates during a drag. */
export function sameOrder(a: WorkingSection[], b: WorkingSection[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((sec, i) => {
    const other = b[i];
    return (
      other.groupId === sec.groupId &&
      sec.itemIds.length === other.itemIds.length &&
      sec.itemIds.every((id, j) => id === other.itemIds[j])
    );
  });
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Place `itemId` at its final drop position. Within its OWN container this is a
 * direction-aware reorder (`arrayMove` to the over item's index — so dragging
 * DOWN past an item lands after it, not before). Into a DIFFERENT container the
 * item is inserted before `overItemId` (or appended when dropping on the
 * container itself / an unknown id). Returns NEW sections; the item appears once.
 */
export function placeItem(
  sections: WorkingSection[],
  itemId: string,
  targetContainer: ContainerId,
  overItemId: string | null,
): WorkingSection[] {
  const current = containerOfItem(sections, itemId);
  if (current !== targetContainer) {
    return moveItemInWorking(sections, itemId, targetContainer, overItemId);
  }
  return sections.map((sec) => {
    if (sec.groupId !== targetContainer) return sec;
    const from = sec.itemIds.indexOf(itemId);
    if (from === -1) return sec;
    let to =
      overItemId === null
        ? sec.itemIds.length - 1
        : sec.itemIds.indexOf(overItemId);
    if (to === -1) to = sec.itemIds.length - 1;
    if (from === to) return sec;
    return { ...sec, itemIds: arrayMove(sec.itemIds, from, to) };
  });
}

/**
 * The `{ groupId, beforeItemId }` the app's `onMoveItem` expects for the final
 * resting place of `itemId` in `sections`: `beforeItemId` is the id that now
 * follows it in its container (null when it is last → append).
 */
export function itemMoveDest(
  sections: WorkingSection[],
  itemId: string,
): { groupId: ContainerId; beforeItemId: string | null } | null {
  const sec = sections.find((s) => s.itemIds.includes(itemId));
  if (!sec) return null;
  const idx = sec.itemIds.indexOf(itemId);
  const beforeItemId = sec.itemIds[idx + 1] ?? null;
  return { groupId: sec.groupId, beforeItemId };
}
