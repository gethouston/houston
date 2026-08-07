import { AppSidebar, WorkspaceSwitcher } from "@houston-ai/layout";
import { useState } from "react";

import { moveGroup, moveItemInList, moveItemToGroup } from "./app-sidebar-move";
import { sectionRows } from "./app-sidebar-sections";
import { UpdateNotice } from "./app-sidebar-stage";
import { agentGroups, agentItems, navEntries, workspaces } from "./sample";

export interface LiveSidebarProps {
  /** Pass `groups` and the drag-and-drop grouped layout replaces the flat list. */
  grouped?: boolean;
  /** Give every block its destination rows and name the default one. */
  teams?: boolean;
  /** Start as the 56px icon rail. The toggle stays live either way. */
  startCollapsed?: boolean;
  /** The full shell chrome: workspace switcher header, nav items, footer. */
  chrome?: boolean;
}

/**
 * `AppSidebar` wired the way the desktop shell wires it: every callback moves
 * real state, so selecting, renaming, deleting, collapsing, toggling a group
 * and dragging an agent between groups all behave here exactly as they do in
 * the product.
 */
export function LiveSidebar({
  grouped = false,
  teams = false,
  startCollapsed = false,
  chrome = false,
}: LiveSidebarProps) {
  const [items, setItems] = useState(agentItems);
  const [groups, setGroups] = useState(agentGroups);
  const [selectedId, setSelectedId] = useState<string | null>("inbox-zero");
  const [activeNavId, setActiveNavId] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [workspaceId, setWorkspaceId] = useState("personal");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const current =
    workspaces.find((one) => one.id === workspaceId) ?? workspaces[0];

  const selectSection = (rowId: string) => {
    setActiveSectionId(rowId);
    setSelectedId(null);
  };
  const selectItem = (id: string) => {
    setSelectedId(id);
    setActiveSectionId(null);
  };

  return (
    <AppSidebar
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((on) => !on)}
      header={
        chrome ? (
          <WorkspaceSwitcher
            workspaces={[...workspaces]}
            currentId={current.id}
            currentName={current.name}
            onSwitch={setWorkspaceId}
            onCreate={() => setWorkspaceId("personal")}
            collapsed={collapsed}
            onExpand={collapsed ? () => setCollapsed(false) : undefined}
          />
        ) : undefined
      }
      navItems={
        chrome
          ? navEntries.map((entry) => ({
              id: entry.id,
              label: entry.label,
              icon: <entry.icon className="size-4" />,
              onClick: () => setActiveNavId(entry.id),
            }))
          : undefined
      }
      activeNavId={activeNavId}
      sectionLabel={teams ? "Your teams" : "Your agents"}
      items={items}
      groups={
        grouped
          ? groups.map((group) =>
              teams
                ? {
                    ...group,
                    sections: sectionRows(
                      group.id,
                      activeSectionId,
                      selectSection,
                    ),
                  }
                : group,
            )
          : undefined
      }
      defaultGroup={
        teams
          ? {
              name: current.name,
              sections: sectionRows("default", activeSectionId, selectSection),
            }
          : undefined
      }
      selectedId={selectedId}
      onSelect={selectItem}
      onAdd={() => setSelectedId(null)}
      onRename={(id, name) =>
        setItems((all) =>
          all.map((item) => (item.id === id ? { ...item, name } : item)),
        )
      }
      onDelete={(id) => setItems((all) => all.filter((item) => item.id !== id))}
      onToggleGroupCollapsed={(id) =>
        setGroups((all) =>
          all.map((group) =>
            group.id === id ? { ...group, collapsed: !group.collapsed } : group,
          ),
        )
      }
      onRenameGroup={(id, name) =>
        setGroups((all) =>
          all.map((group) => (group.id === id ? { ...group, name } : group)),
        )
      }
      onDeleteGroup={(id) =>
        setGroups((all) => all.filter((group) => group.id !== id))
      }
      onMoveItem={(itemId, dest) => {
        setGroups((all) => moveItemToGroup(all, itemId, dest));
        if (dest.groupId === null) {
          setItems((all) => moveItemInList(all, itemId, dest.beforeItemId));
        }
      }}
      onMoveGroup={(groupId, beforeGroupId) =>
        setGroups((all) => moveGroup(all, groupId, beforeGroupId))
      }
      footer={chrome ? <UpdateNotice /> : undefined}
    />
  );
}
