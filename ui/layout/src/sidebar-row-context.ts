import type { SidebarLabels } from "./sidebar";

/**
 * What every rendered row needs beyond its own item: which one is selected,
 * what a click does, and the host's words.
 *
 * There is no rename / delete / menu plumbing here any more. An agent is edited
 * on its focused agent screen, so the rail neither offers those actions
 * nor carries the state for them — no editing id, no draft value, no per-row
 * key handler. Renaming a TEAM is untouched: that lives on the block header,
 * which owns its own inline-edit session.
 */
export interface SidebarRowContext {
  selectedId?: string | null;
  onSelect: (id: string) => void;
  labels: Required<SidebarLabels>;
}

/** Row state/handlers shared by both list modes. */
export type SidebarBaseRowContext = SidebarRowContext;
