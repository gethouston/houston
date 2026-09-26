import { ADMIN_VIEW_ID } from "../components/organization/id.ts";
import { useOrgNav } from "../components/organization/org-nav-store.ts";
import type { OrgTabId } from "../components/organization/org-view-model.ts";
import { useUIStore } from "../stores/ui.ts";
import type { NavMode } from "./nav-stack.ts";

/**
 * Open Admin from the rail, More menu, or a deep link. A `section` is pinned
 * BEFORE navigating: Admin is kept alive, so the dashboard consumes the pin
 * whether it mounts now or is already open behind another view.
 */
export function openAdmin(options?: {
  nav?: NavMode;
  section?: OrgTabId;
}): void {
  if (options?.section) useOrgNav.getState().requestTab(options.section);
  const ui = useUIStore.getState();
  ui.setViewMode(ADMIN_VIEW_ID, { nav: options?.nav });
  ui.setMobileMoreOpen(false);
}
