import type { ReactNode } from "react";
import type { SidebarGroupView, SidebarRootEntry } from "./sidebar-groups";
import type { SidebarLabels } from "./sidebar-labels";
import type { SidebarArrangement } from "./sidebar-tree";

export interface SidebarItem {
  id: string;
  name: string;
  icon?: ReactNode;
  /** The line under a person row's name (up to two lines): what the employee
   *  is doing. Absent: the name sits alone, centred, at the same row height. */
  subtitle?: ReactNode;
  /** Row badges or status indicators. A person row carries them at the end of
   *  its second line; every other row at its right edge. */
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
  /** DOM attributes (test ids, tour anchors) on the row: the expanded row's
   *  root and the collapsed rail's button. The collapsed flyout's copy of the
   *  row goes without, so an id never matches twice. */
  dataAttrs?: Record<string, string>;
}

export interface SidebarProps {
  /**
   * The rail's own verbs (search, create), on the top line beside the collapse
   * toggle when expanded and stacked under it when collapsed. Wear
   * `sidebarHeaderControlClasses` so they match the toggle.
   */
  headerActions?: ReactNode;
  /**
   * A FULL-WIDTH notice directly under the top line, above the list (e.g. the
   * pending-invite inbox). Not part of the top line, which it would crowd:
   * it spans the rail like every row below it.
   */
  headerBelow?: ReactNode;
  items: SidebarItem[];
  /**
   * Rows that lead the list, ahead of every group (expanded) or every item
   * (collapsed). Drawn exactly like `items` and selected through the same
   * `selectedId` / `onSelect`, but never grouped and never draggable.
   */
  pinnedItems?: SidebarItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /**
   * Named groups in display order. When provided (even []), the grouped
   * drag-and-drop layout renders; items whose id is in no group render in a
   * top-level entry of their own, placed by `order`. When undefined → flat
   * list. Agents and groups are always drag-reorderable in grouped mode.
   */
  groups?: SidebarGroupView[];
  order?: SidebarRootEntry[];
  /**
   * A block's header row was activated: fold or unfold that block. `collapsed`
   * on the view model stays the single controlled truth about the fold, so the
   * host answers by writing the new value back there.
   */
  onActivateGroup?: (groupId: string) => void;
  /**
   * A drop landed. Carries the WHOLE arrangement the rail now shows (the
   * top-level order and every group's members), read off the same rows the
   * drag drew, so the host stores exactly what the person saw. Answers whether
   * the write was accepted: a refused drop is not drawn. Absent, the rail offers
   * no drag and no keyboard move.
   */
  onArrange?: (arrangement: SidebarArrangement) => boolean;
  /**
   * The shortcut that closes the list (`SidebarAddRow`), drawn inside the
   * scroll box right after the last row, in both rail states. It scrolls with
   * the rows it closes.
   */
  listFooter?: ReactNode;
  footer?: ReactNode;
  labels?: SidebarLabels;
  /** Icon-only rail: hide all text labels, reveal them via hover/focus flyouts. */
  collapsed?: boolean;
  /** The host window controls occupy the rail's top-left corner; the rail
   *  reserves a clear row for them. */
  windowControlsInset?: boolean;
  /** Toggle between expanded and collapsed. The button is always visible. */
  onToggleCollapsed?: () => void;
  children?: ReactNode;
}
