import type { Specimen } from "../../../src/specimen";
import { specimen as appSidebar } from "./app-sidebar";
import { specimen as filesBrowser } from "./files-browser";
import { specimen as sidebarGroupHeader } from "./sidebar-group-header";
import { specimen as sidebarProfileMenu } from "./sidebar-profile-menu";
import { specimen as sidebarRowButton } from "./sidebar-row-button";
import { specimen as sidebarWorkspaceSwitcher } from "./sidebar-workspace-switcher";
import { specimen as splitView } from "./split-view";
import { specimen as tabBar } from "./tab-bar";

export const specimens: readonly Specimen[] = [
  sidebarRowButton,
  sidebarGroupHeader,
  sidebarProfileMenu,
  sidebarWorkspaceSwitcher,
  appSidebar,
  tabBar,
  splitView,
  filesBrowser,
];
