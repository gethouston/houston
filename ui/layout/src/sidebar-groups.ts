import type { ReactNode } from "react";
import type { SidebarGroupIdentity } from "./sidebar-group-identity";
import type { SidebarItem } from "./sidebar-props";

/** Re-exported so a host describing a block never needs a second import. */
export type { SidebarGroupIdentity };

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
  /** The icon-and-colour picker. A VETO like `rename` and `delete`, NOT an
   *  opt-in like `leave`: absent leaves the decision to whether the host
   *  supplied an {@link SidebarGroupView.identity} at all, and only an explicit
   *  `false` takes it away. Restyling edits the BLOCK, not the caller's
   *  standing in it, so silence must never retract it. */
  identity?: boolean;
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
  /**
   * A badge INSIDE the header row, right-aligned — the block's own rollup of
   * whatever its items are signalling. A FOLDED block hides its item rows, so
   * anything they were saying leaves the rail with them; this is the slot that
   * says it on their behalf. The library stays generic about what is being
   * counted: the host composes the node and decides when there is one, which
   * is also how "an open block shows nothing extra" is expressed (no node).
   */
  trailing?: ReactNode;
  /** Which header-menu affordances this group offers. Absent ⇒ all of the ones
   *  the host wired up; see {@link SidebarGroupAffordances}. */
  affordances?: SidebarGroupAffordances;
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
  /**
   * The block's icon-and-colour picker. ABSENT ⇒ the block offers no identity
   * entry; PRESENT and not vetoed by
   * {@link SidebarGroupAffordances.identity} ⇒ it does.
   *
   * Its `onChange` arrives ALREADY BOUND to this block, exactly like
   * {@link SidebarDefaultGroupView.onRename}: the default block hands back no
   * id, so a callback that expected one could not serve both block kinds.
   */
  identity?: SidebarGroupIdentity;
}

/**
 * Whether a mask offers `affordance`. The mask is a VETO, not a grant — the
 * host's callback is the grant — except for `leave`, which is opt-in (see
 * {@link SidebarGroupAffordances}). With no mask every answer is the callback's
 * own, which is what keeps a host that passes none rendering exactly as before.
 *
 * It takes the MASK and not a group because both block kinds carry one now: the
 * default block's header offers a rename on a host that owns the teams, and one
 * rule read two ways is how the two block kinds start disagreeing about what
 * `false` means.
 */
export function affordanceAllowed(
  affordances: SidebarGroupAffordances | undefined,
  affordance: keyof SidebarGroupAffordances,
): boolean {
  if (affordance === "leave") return affordances?.leave === true;
  return affordances?.[affordance] !== false;
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
 * never a drag source and it can be neither deleted nor left; the one thing it
 * CAN offer is a rename, and only when the host wires {@link onRename}.
 */
export interface SidebarDefaultGroupView {
  name: string;
  /** The block's rollup badge, on exactly the terms a named group has it
   *  ({@link SidebarGroupView.trailing}). */
  trailing?: ReactNode;
  /**
   * Rename this block, committed from the header's inline edit. Absent means
   * the name is not the user's to change here, and then the block carries no
   * "..." menu at all — an affordance that silently does nothing is worse than
   * no affordance.
   *
   * A field on the view model rather than a sibling prop because the default
   * block hands back no id (the host already knows what it is naming), exactly
   * as {@link SidebarGroupView.identity}'s `onChange` does.
   */
  onRename?: (newName: string) => void;
  /** Which header-menu affordances this block offers. Absent ⇒ all of the ones
   *  the host wired up; see {@link SidebarGroupAffordances}. Only `rename` and
   *  `identity` are ever read here — they are the block's two possible
   *  entries. */
  affordances?: SidebarGroupAffordances;
  /** The block's icon-and-colour picker, on exactly the terms a named group has
   *  it ({@link SidebarGroupView.identity}); absent ⇒ no identity entry. Its
   *  `onChange` is already bound to this block for the same reason
   *  {@link onRename} is: the default block has no id to hand back. */
  identity?: SidebarGroupIdentity;
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
