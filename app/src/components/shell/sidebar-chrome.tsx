import type { SidebarLabels } from "@houston-ai/layout";
import type { TFunction } from "i18next";

export type SidebarChromeT = TFunction<["shell", "common", "teams"]>;

export function buildSidebarLabels(t: SidebarChromeT): SidebarLabels {
  return {
    collapseSidebar: t("shell:sidebar.collapse"),
    expandSidebar: t("shell:sidebar.expand"),
    dragPickedUp: t("shell:sidebar.drag.pickedUp"),
    dragMovedOver: t("shell:sidebar.drag.movedOver"),
    dragDropped: t("shell:sidebar.drag.dropped"),
    dragCancelled: t("shell:sidebar.drag.cancelled"),
    dragInstructions: t("shell:sidebar.drag.instructions"),
    dragKeyboardMoved: t("shell:sidebar.drag.keyboardMoved"),
    dragKeyboardMovedInGroup: t("shell:sidebar.drag.keyboardMovedInGroup"),
    dragKeyboardEnteredGroup: t("shell:sidebar.drag.keyboardEnteredGroup"),
    dragKeyboardLeftGroup: t("shell:sidebar.drag.keyboardLeftGroup"),
    emptyGroup: t("shell:sidebar.teams.empty"),
  };
}
