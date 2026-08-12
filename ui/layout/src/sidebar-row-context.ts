/**
 * What every rendered row needs beyond its own item: which one is selected, and
 * what a click does.
 *
 * That is the whole of it. An agent is edited on its focused agent screen, so
 * the rail carries no rename / delete / menu plumbing — no editing id, no draft
 * value, no per-row key handler. A team's name and mark are changed in a dialog
 * the host owns, which the rail opens and knows nothing else about. Words stay
 * out too: the rows that render a label of their own take it as an explicit
 * prop, so nothing rides down this context unread.
 */
export interface SidebarRowContext {
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

/** Row state/handlers shared by both list modes. */
export type SidebarBaseRowContext = SidebarRowContext;
