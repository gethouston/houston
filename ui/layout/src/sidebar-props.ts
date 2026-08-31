import type { ReactNode } from "react";
import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
} from "./sidebar-groups";
import type { SidebarLabels } from "./sidebar-labels";

export interface SidebarItem {
  id: string;
  name: string;
  icon?: ReactNode;
  /** Optional right-aligned slot for row badges or status indicators. */
  trailing?: ReactNode;
  /**
   * Optional control OUTSIDE the row button, after `trailing` — a "..." menu
   * trigger. The HOST owns what it opens; the library only places it (a button
   * may not nest inside a button, so it renders as the row's sibling). Wear
   * `sidebarRowAffordanceClasses` on the trigger so it matches the rail's
   * other small controls. Omitted from the collapsed rail's hover flyout,
   * which is too transient a surface to anchor a menu to.
   */
  affordance?: ReactNode;
}

export interface SidebarNavItemEntry {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  /** Optional right-aligned slot (e.g. a "Beta" badge). */
  trailing?: ReactNode;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the rendered button. */
  dataAttrs?: Record<string, string>;
}

/**
 * One labelled run of top-level destinations above the list.
 *
 * The rail's nav is a LIST OF SECTIONS rather than one flat array because the
 * label and the rows it names are one fact: a section whose rows a gate empties
 * must not leave a naked band behind, and the renderer can only guarantee that
 * if it can see which rows belong to which label.
 */
export interface SidebarNavSection {
  /** Stable React key. Never rendered. */
  id: string;
  /** The band naming this run. Absent → an unlabelled run (the destinations
   *  that lead the rail and need no heading). */
  label?: string;
  items: SidebarNavItemEntry[];
  /**
   * Whether this run is folded away behind its band. Controlled, because the
   * host persists it — a rail that forgets it was folded every reload is worse
   * than one that never folded. Meaningless without `label`: an unlabelled run
   * has no band to fold from, exactly like the icon rail.
   */
  collapsed?: boolean;
  /** Absent means the band is a plain label and folds nothing. */
  onToggleCollapsed?: () => void;
}

export interface SidebarProps {
  logo?: ReactNode;
  /** Header area rendered at the very top (e.g. space/org switcher). */
  header?: ReactNode;
  /**
   * A FULL-WIDTH band directly under the header, above the nav (e.g. the
   * pending-invite inbox). Deliberately not part of `header`: expanded, the
   * header shares its row with the collapse toggle, so anything tall put there
   * is inset by the toggle's width AND drags the vertically-centred toggle down
   * to the middle of the block. This slot spans the rail like every row below
   * it and leaves the toggle on the header's own line.
   */
  headerBelow?: ReactNode;
  /** The top-level destinations above the list, in labelled runs. */
  navSections?: SidebarNavSection[];
  activeNavId?: string;
  items: SidebarItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /**
   * Creates an item. In the GROUPED list it renders as the row that closes the
   * list, because creating is the rail's primary action and a primary action
   * may not live only one level deep inside a menu. In the flat / collapsed
   * rail it stays the trailing icon button it has always been.
   */
  onAdd?: () => void;
  /** Creates an item in one expanded group (`null` is the default group). */
  onAddToGroup?: (groupId: string | null) => void;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the add-item control. */
  addItemDataAttrs?: Record<string, string>;
  /** Names the list. Expanded rail only. */
  sectionLabel?: string;
  /** One inline control at the right edge of the section band, expanded only
   *  (e.g. a "+" menu trigger). */
  sectionAction?: ReactNode;
  /**
   * Fold the WHOLE list away behind the section band. Controlled, because the
   * host persists it: a rail that forgets it was folded every reload is worse
   * than one that never folded.
   */
  sectionCollapsed?: boolean;
  /** Absent means the band folds nothing and renders as a plain label. */
  onToggleSectionCollapsed?: () => void;
  /**
   * Named groups in display order. When provided (even []), the grouped
   * drag-and-drop layout renders; items whose id is in no group render in a
   * trailing default section. When undefined → flat list, unchanged. Agents are
   * always drag-reorderable in grouped mode.
   */
  groups?: SidebarGroupView[];
  /**
   * Names the trailing default section, turning it into a labelled block
   * instead of a bare list. Grouped mode only (the collapsed rail is always
   * flat).
   */
  defaultGroup?: SidebarDefaultGroupView;
  /**
   * A block's header row was activated.
   *
   * The library does NOT decide what that means, which is why this is no
   * longer called "toggle collapsed": a header may open the block's screen,
   * fold the block, or both, depending on where the host already is. `collapsed`
   * on the view model stays the single controlled truth about the fold, so the
   * host's answer is whatever it writes back there.
   */
  onActivateGroup?: (groupId: string) => void;
  /** The trailing DEFAULT block's header was activated. Its own callback
   *  because that block is not a stored group and has no id to hand back. */
  onActivateDefault?: () => void;
  /**
   * Reorder an item WITHIN its own container, before `beforeItemId` (null =
   * append to the end of that section). `groupId` is always the container the
   * item was already in (null = default section) — a drag cannot move an item
   * between blocks, so it is the position that changed and never the block.
   */
  onMoveItem?: (
    itemId: string,
    dest: { groupId: string | null; beforeItemId: string | null },
  ) => void;
  /** Reorder group before `beforeGroupId` (null = move to end). */
  onMoveGroup?: (groupId: string, beforeGroupId: string | null) => void;
  footer?: ReactNode;
  labels?: SidebarLabels;
  /** Icon-only rail: hide all text labels, reveal them via hover/focus flyouts. */
  collapsed?: boolean;
  /** Toggle between expanded and collapsed. The button is always visible. */
  onToggleCollapsed?: () => void;
  children?: ReactNode;
}
