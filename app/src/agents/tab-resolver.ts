import type { ComponentType } from "react";
import ArchivedTab from "../components/tabs/archived-tab";
import BoardTab from "../components/tabs/board-tab";
import FilesTab from "../components/tabs/files-tab";
import JobDescriptionTab from "../components/tabs/job-description-tab";
import RoutinesTab from "../components/tabs/routines-tab";
import type { TabProps } from "../lib/types";
import type { AgentTab } from "./standard-tabs";

const BUILTIN_TABS: Record<string, ComponentType<TabProps>> = {
  board: BoardTab,
  archived: ArchivedTab,
  files: FilesTab,
  "job-description": JobDescriptionTab,
  routines: RoutinesTab,
};

export function resolveTabComponent(tab: AgentTab): ComponentType<TabProps> {
  const Component = BUILTIN_TABS[tab.builtIn];
  if (!Component) {
    throw new Error(`Unknown built-in tab: ${tab.builtIn}`);
  }
  return Component;
}
