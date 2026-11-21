import type {
  SidebarArrangement,
  SidebarGroupView,
  SidebarItem,
  SidebarRootEntry,
} from "@houston-ai/layout";
import { AppSidebar, SidebarAddRow } from "@houston-ai/layout";
import type { ReactNode } from "react";
import { SidebarInviteInbox } from "./pending-invites";
import { buildSidebarLabels, type SidebarChromeT } from "./sidebar-chrome";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarHeaderActions } from "./sidebar-header-actions";

export interface SidebarRailModel {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpand: () => void;
  onCreateWorkspace: () => void;
  onArrange: (arrangement: SidebarArrangement) => boolean;
  ready: boolean;
  items: SidebarItem[];
  pinnedItems: SidebarItem[];
  groups: SidebarGroupView[];
  order: SidebarRootEntry[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onActivateGroup: (id: string) => void;
  onNewTeam: () => void;
  onAddAgent: (() => void) | undefined;
}

export function SidebarRail({
  model,
  t,
  windowControlsInset = false,
  gutterChildren,
}: {
  model: SidebarRailModel;
  t: SidebarChromeT;
  windowControlsInset?: boolean;
  gutterChildren?: ReactNode;
}) {
  const { collapsed, ready } = model;
  return (
    <AppSidebar
      windowControlsInset={windowControlsInset}
      collapsed={collapsed}
      onToggleCollapsed={model.onToggleCollapsed}
      headerActions={
        <SidebarHeaderActions
          t={t}
          collapsed={collapsed}
          onNewAgent={model.onAddAgent}
          onNewTeam={ready ? model.onNewTeam : undefined}
        />
      }
      headerBelow={
        <SidebarInviteInbox collapsed={collapsed} onExpand={model.onExpand} />
      }
      items={model.items}
      pinnedItems={model.pinnedItems}
      groups={model.groups}
      order={model.order}
      onActivateGroup={ready ? model.onActivateGroup : undefined}
      onArrange={ready ? model.onArrange : undefined}
      selectedId={model.selectedAgentId}
      onSelect={model.onSelectAgent}
      labels={buildSidebarLabels(t)}
      listFooter={
        model.onAddAgent && (
          <SidebarAddRow
            label={t("shell:sidebar.addEmployee")}
            onClick={model.onAddAgent}
            collapsed={collapsed}
            dataAttrs={{ "data-testid": "rail-add-employee" }}
          />
        )
      }
      footer={
        <SidebarFooter
          collapsed={collapsed}
          onCreateWorkspace={model.onCreateWorkspace}
        />
      }
    >
      {gutterChildren}
    </AppSidebar>
  );
}
