import type { KeyboardEvent } from "react";
import type { SidebarLabels } from "./sidebar";

/** Item-level editing state + handlers shared by every rendered section. */
export interface SidebarRowContext {
  selectedId?: string | null;
  editingId: string | null;
  editValue: string;
  hasDefaultMenu: boolean;
  onSelect: (id: string) => void;
  onItemKeyDown: (e: KeyboardEvent, id: string) => void;
  onEditChange: (value: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onStartRename?: (id: string, name: string) => void;
  onDeleteItem?: (id: string) => void;
  labels: Required<SidebarLabels>;
}

/** Item editing state/handlers shared by both list modes. */
export type SidebarBaseRowContext = SidebarRowContext;
