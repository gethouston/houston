/**
 * Every word the sidebar can render, supplied by the host.
 *
 * `ui/` is i18n-agnostic by rule: the library never imports a translation
 * runtime, it takes labels as props with English defaults and the app hands
 * `t()` results in. That is why this is one flat bag rather than strings spread
 * through the components.
 */
export interface SidebarLabels {
  addItem?: string;
  collapseSidebar?: string;
  /** The menu's ONE identity entry: opens the host's icon-and-name editor. */
  editGroup?: string;
  deleteGroup?: string;
  /** Menu entry that gives up the caller's membership of the group. */
  leaveGroup?: string;
  /** aria label for the group "..." menu trigger. */
  groupMenu?: string;
}

export const DEFAULT_SIDEBAR_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  collapseSidebar: "Collapse sidebar",
  editGroup: "Change icon & name",
  deleteGroup: "Delete group",
  leaveGroup: "Leave group",
  groupMenu: "Group options",
};
