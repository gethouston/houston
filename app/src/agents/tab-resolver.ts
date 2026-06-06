import type { ComponentType } from "react";
import type { TabProps } from "../lib/types";
import type { AgentTab } from "./standard-tabs";
import BoardTab from "../components/tabs/board-tab";
import ArchivedTab from "../components/tabs/archived-tab";
import FilesTab from "../components/tabs/files-tab";
import IntegrationsTab from "../components/tabs/integrations-tab";
import JobDescriptionTab from "../components/tabs/job-description-tab";
import RoutinesTab from "../components/tabs/routines-tab";
import WorkflowsTab from "../components/tabs/workflows-tab";

const BUILTIN_TABS: Record<string, ComponentType<TabProps>> = {
  board: BoardTab,
  archived: ArchivedTab,
  files: FilesTab,
  integrations: IntegrationsTab,
  "job-description": JobDescriptionTab,
  routines: RoutinesTab,
  workflows: WorkflowsTab,
};

export function resolveTabComponent(tab: AgentTab): ComponentType<TabProps> {
  const Component = BUILTIN_TABS[tab.builtIn];
  if (!Component) {
    throw new Error(`Unknown built-in tab: ${tab.builtIn}`);
  }
  return Component;
}
