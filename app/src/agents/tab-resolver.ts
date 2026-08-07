import type { ComponentType } from "react";
import AdminTab from "../components/tabs/admin-tab";
import BoardTab from "../components/tabs/board-tab";
import ContextTab from "../components/tabs/context-tab";
import FilesTab from "../components/tabs/files-tab";
import IntegrationsTab from "../components/tabs/integrations-tab";
import RoutinesTab from "../components/tabs/routines-tab";
import SkillsTab from "../components/tabs/skills-tab";
import type { TabProps } from "../lib/types";
import type { AgentTab } from "./standard-tabs";

const BUILTIN_TABS: Record<string, ComponentType<TabProps>> = {
  admin: AdminTab,
  board: BoardTab,
  context: ContextTab,
  files: FilesTab,
  integrations: IntegrationsTab,
  routines: RoutinesTab,
  skills: SkillsTab,
};

export function resolveTabComponent(tab: AgentTab): ComponentType<TabProps> {
  const Component = BUILTIN_TABS[tab.builtIn];
  if (!Component) {
    throw new Error(`Unknown built-in tab: ${tab.builtIn}`);
  }
  return Component;
}
