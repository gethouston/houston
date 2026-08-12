import type { ReactNode } from "react";
import type { SidebarItem } from "./sidebar-props";

/** A named, collapsible group of sidebar items in display order. */
export interface SidebarGroupView {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
  /**
   * A badge INSIDE the header row, right-aligned — the block's own rollup of
   * whatever its items are signalling. A FOLDED block hides its item rows, so
   * anything they were saying leaves the rail with them; this is the slot that
   * says it on their behalf. The library stays generic about what is being
   * counted: the host composes the node and decides when there is one, which
   * is also how "an open block shows nothing extra" is expressed (no node).
   */
  trailing?: ReactNode;
  /** The group's mark, rendered in the shared glyph column on its header row.
   *  The library stays generic about what a group IS, so the host supplies the
   *  icon; the box is reserved either way, so a host that passes none still
   *  gets a header whose name sits on the same optical column as everyone
   *  else's. */
  icon?: ReactNode;
  /**
   * Paint the header row as the selected one. Controlled — the list never picks
   * it.
   *
   * A block no longer carries destination rows, so its HEADER is the only row
   * that can say the open view belongs to this block. It says so folded or
   * open: folding is the user's own choice about how much rail a block costs,
   * never a statement about where they are.
   */
  active?: boolean;
}

/**
 * Turns the trailing default section (items in no group) into a LABELLED block:
 * a header carrying `name`, then the ungrouped item rows. Absent → the legacy
 * unlabelled trailing section.
 *
 * It renders as a peer of the named teams above it, collapse included — a block
 * that folded away everywhere except here would make the default team the one
 * row in the rail that answers a click differently, which is exactly the kind
 * of exception a user reads as a bug. It is still not a stored group, so it is
 * never a drag source and it can be neither deleted nor left.
 */
export interface SidebarDefaultGroupView {
  name: string;
  /** The block's rollup badge, on exactly the terms a named group has it
   *  ({@link SidebarGroupView.trailing}). */
  trailing?: ReactNode;
  /**
   * Folded shut. Separate from a group's own `collapsed` because the default
   * block is VIRTUAL on the local backend — it is the workspace itself, not a
   * stored group — so its state has nowhere to live among `layout.groups`. The
   * host persists it as the additive `SidebarLayout.defaultCollapsed`; absent
   * reads as `false`, which leaves every layout written before this untouched.
   */
  collapsed?: boolean;
  /** The block's mark, in the shared glyph column. See
   *  {@link SidebarGroupView.icon}. */
  icon?: ReactNode;
  /** Paint the header row as selected. See {@link SidebarGroupView.active}. */
  active?: boolean;
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
