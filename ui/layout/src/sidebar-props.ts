import type { ReactNode } from "react";
import type { SidebarGroupView, SidebarRootEntry } from "./sidebar-groups";
import type { SidebarLabels } from "./sidebar-labels";
import type { SidebarArrangement } from "./sidebar-tree";

export interface SidebarItem {
  id: string;
  name: string;
  icon?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  affordance?: ReactNode;
  dataAttrs?: Record<string, string>;
}

export interface SidebarProps {
  headerActions?: ReactNode;
  headerBelow?: ReactNode;
  items: SidebarItem[];
  pinnedItems?: SidebarItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  groups?: SidebarGroupView[];
  order?: SidebarRootEntry[];
  onActivateGroup?: (groupId: string) => void;
  onArrange?: (arrangement: SidebarArrangement) => boolean;
  listFooter?: ReactNode;
  footer?: ReactNode;
  labels?: SidebarLabels;
  collapsed?: boolean;
  windowControlsInset?: boolean;
  onToggleCollapsed?: () => void;
  children?: ReactNode;
}
