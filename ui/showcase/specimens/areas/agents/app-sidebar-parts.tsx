import { AppSidebar, WorkspaceSwitcher } from "@houston-ai/layout";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { moveGroup, moveItemInList, moveItemToGroup } from "./app-sidebar-move";
import {
  agentGroups,
  agentItems,
  navEntries,
  Viewport,
  workspaces,
} from "./sample";

/** The rail beside the pane it sits next to, so its 220/56px width reads true. */
export function SidebarStage({ children }: { children: ReactNode }) {
  return (
    <Viewport className="h-[440px] w-full max-w-2xl">
      {children}
      <div className="flex flex-1 items-center justify-center p-6 text-center text-ink-muted text-xs">
        The agent's workspace — whatever the selected rail row opens.
      </div>
    </Viewport>
  );
}

/** The footer slot the desktop shell fills with its update notice. */
function UpdateNotice() {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 text-ink-muted text-xs">
      <Sparkles className="size-3.5 shrink-0" />
      Update ready — restart to install
    </div>
  );
}

/** A brand-new workspace: the section label and the + button, nothing under. */
export function EmptyRail() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <AppSidebar
      sectionLabel="Your agents"
      items={[]}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={() => setSelectedId(null)}
    />
  );
}

export interface LiveSidebarProps {
  /** Pass `groups` and the drag-and-drop grouped layout replaces the flat list. */
  grouped?: boolean;
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
  startCollapsed = false,
  chrome = false,
}: LiveSidebarProps) {
  const [items, setItems] = useState(agentItems);
  const [groups, setGroups] = useState(agentGroups);
  const [selectedId, setSelectedId] = useState<string | null>("inbox-zero");
  const [activeNavId, setActiveNavId] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [workspaceId, setWorkspaceId] = useState("personal");

  const current =
    workspaces.find((one) => one.id === workspaceId) ?? workspaces[0];

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
      sectionLabel="Your agents"
      items={items}
      groups={grouped ? groups : undefined}
      selectedId={selectedId}
      onSelect={setSelectedId}
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
