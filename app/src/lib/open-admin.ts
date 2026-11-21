import { ADMIN_VIEW_ID } from "../components/organization/id.ts";
import { useOrgNav } from "../components/organization/org-nav-store.ts";
import type { OrgTabId } from "../components/organization/org-view-model.ts";
import { useUIStore } from "../stores/ui.ts";
import type { NavMode } from "./nav-stack.ts";

export function openAdmin(options?: {
  nav?: NavMode;
  section?: OrgTabId;
}): void {
  if (options?.section) useOrgNav.getState().requestTab(options.section);
  const ui = useUIStore.getState();
  ui.setViewMode(ADMIN_VIEW_ID, { nav: options?.nav });
  ui.setMobileMoreOpen(false);
}
