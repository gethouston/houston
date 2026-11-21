export interface SidebarLabels {
  collapseSidebar?: string;
  expandSidebar?: string;
  dragPickedUp?: string;
  dragMovedOver?: string;
  dragDropped?: string;
  dragCancelled?: string;
  dragInstructions?: string;
  dragKeyboardMoved?: string;
  dragKeyboardMovedInGroup?: string;
  dragKeyboardEnteredGroup?: string;
  dragKeyboardLeftGroup?: string;
  emptyGroup?: string;
}

export const DEFAULT_SIDEBAR_LABELS: Required<SidebarLabels> = {
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
  emptyGroup: "Drag an item here",
};
