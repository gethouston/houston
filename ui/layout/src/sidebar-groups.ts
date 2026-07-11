import type { SidebarItem } from "./sidebar";

/** A named, collapsible group of sidebar items in display order. */
export interface SidebarGroupView {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
}

/** One rendered section: a named group, or the trailing default (ungrouped). */
export interface SidebarSection {
  /** Group id, or null for the trailing default (ungrouped) section. */
  groupId: string | null;
  group: SidebarGroupView | null;
  items: SidebarItem[];
}

/**
 * Partition `items` into ordered group sections plus a trailing default
 * section. Group sections follow `groups` order and hold their `itemIds`
 * (resolved to items, skipping ids with no matching item) in that order. The
 * default section holds every item whose id is in no group, in `items` order.
 *
 * The default section is always appended (even when empty) so it stays a valid
 * drop target and the "add item" affordance has a stable home.
 */
export function computeSidebarSections(
  items: SidebarItem[],
  groups: SidebarGroupView[],
): SidebarSection[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const grouped = new Set<string>();
  const sections: SidebarSection[] = groups.map((group) => {
    const groupItems: SidebarItem[] = [];
    for (const id of group.itemIds) {
      const it = byId.get(id);
      if (it && !grouped.has(id)) {
        groupItems.push(it);
        grouped.add(id);
      }
    }
    return { groupId: group.id, group, items: groupItems };
  });
  const defaultItems = items.filter((it) => !grouped.has(it.id));
  sections.push({ groupId: null, group: null, items: defaultItems });
  return sections;
}
