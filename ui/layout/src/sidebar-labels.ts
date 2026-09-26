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
  expandSidebar?: string;
  dragPickedUp?: string;
  dragMovedOver?: string;
  dragDropped?: string;
  dragCancelled?: string;
  dragInstructions?: string;
  /** A keyboard move at the top level: `%name%`, `%position%`. */
  dragKeyboardMoved?: string;
  /** A keyboard move inside a group: `%name%`, `%position%`, `%group%`. */
  dragKeyboardMovedInGroup?: string;
  /** A keyboard move into a group: `%name%`, `%group%`. */
  dragKeyboardEnteredGroup?: string;
  /** A keyboard move out of a group to the top level: `%name%`, `%group%`. */
  dragKeyboardLeftGroup?: string;
}

export const DEFAULT_SIDEBAR_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  collapseSidebar: "Collapse sidebar",
  expandSidebar: "Expand sidebar",
  dragPickedUp: "Picked up %name%.",
  dragMovedOver: "%name% over %over%.",
  dragDropped: "Dropped %name% over %over%.",
  dragCancelled: "Cancelled moving %name%.",
  dragInstructions:
    "Drag with the pointer. Use Alt+Up or Alt+Down to reorder, and Alt+Right or Alt+Left to move an item into or out of a group.",
  dragKeyboardMoved: "Moved %name% to position %position% at the top level.",
  dragKeyboardMovedInGroup: "Moved %name% to position %position% in %group%.",
  dragKeyboardEnteredGroup: "Moved %name% into %group%.",
  dragKeyboardLeftGroup: "Moved %name% out of %group%, to the top level.",
};
