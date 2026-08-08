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

/**
 * Which header-menu affordances THIS group offers, independently of its
 * siblings. Per GROUP rather than per list because a server-owned team may be
 * renamable while the next one is not, and one set of list-level callbacks
 * cannot say that.
 *
 * An absent mask means every affordance the host wired a callback for, which is
 * exactly the behavior before masks existed. A field left `undefined` inside a
 * present mask means the same: no opinion, the callback alone decides. Only
 * `false` takes something away, so describing one affordance can never silently
 * retract the ones you did not mention.
 */
export interface SidebarGroupAffordances {
  rename?: boolean;
  delete?: boolean;
  /** The group's shared-context editor. */
  context?: boolean;
  /**
   * Leaving is the one OPT-IN flag: only an explicit `true` shows it, and an
   * absent mask hides it. It acts on the CALLER's membership rather than on the
   * group, so a host must never acquire it by staying silent — and a host that
   * has no notion of joining a group must never be handed a way out of one.
   */
  leave?: boolean;
}

/** A named, collapsible group of sidebar items in display order. */
export interface SidebarGroupView {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
  /** Destination rows rendered above this group's item rows. */
  sections?: SidebarSectionRow[];
  /** Which header-menu affordances this group offers. Absent ⇒ all of the ones
   *  the host wired up; see {@link SidebarGroupAffordances}. */
  affordances?: SidebarGroupAffordances;
}

/**
 * Whether `group` offers `affordance`. The mask is a VETO, not a grant — the
 * host's callback is the grant — except for `leave`, which is opt-in (see
 * {@link SidebarGroupAffordances}). With no mask every answer is the callback's
 * own, which is what keeps a host that passes none rendering exactly as before.
 */
export function groupAllows(
  group: SidebarGroupView,
  affordance: keyof SidebarGroupAffordances,
): boolean {
  if (affordance === "leave") return group.affordances?.leave === true;
  return group.affordances?.[affordance] !== false;
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
