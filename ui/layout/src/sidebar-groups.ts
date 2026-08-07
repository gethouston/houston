import type { ReactNode } from "react";
import type { SidebarItem } from "./sidebar";

/**
 * A destination row rendered ABOVE a group's item rows (e.g. a team's Mission
 * Control or Settings). It is a link, not a member of the list: never a drag
 * source, never a drop target.
 */
export interface SidebarSectionRow {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Painted as the selected row. Controlled — the list never picks one. */
  active: boolean;
  onSelect: () => void;
}

/** A named, collapsible group of sidebar items in display order. */
export interface SidebarGroupView {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
  /** Destination rows rendered above this group's item rows. */
  sections?: SidebarSectionRow[];
}

/**
 * Turns the trailing default section (items in no group) into a LABELLED,
 * non-collapsible block: a plain header carrying `name`, its own section rows,
 * then the ungrouped item rows. It has no chevron and no "..." menu — the block
 * stands for the container itself, which cannot be renamed, folded or deleted
 * from here. Absent → the legacy unlabelled trailing section.
 */
export interface SidebarDefaultGroupView {
  name: string;
  sections?: SidebarSectionRow[];
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
