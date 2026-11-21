import { AppSidebar, type SidebarRootEntry } from "@houston-ai/layout";
import { useState } from "react";

import { RailFoot } from "./app-sidebar-foot";
import { AddEmployee, BlockRollup, RailActions } from "./app-sidebar-stage";
import { agentGroups, agentItems, managerItem, TeamIcon } from "./sample";

export interface LiveSidebarProps {
  grouped?: boolean;
  teams?: boolean;
  startCollapsed?: boolean;
  chrome?: boolean;
  windowControlsInset?: boolean;
  initialSelectedId?: string | null;
}

export function LiveSidebar({
  grouped = false,
  teams = false,
  startCollapsed = false,
  chrome = false,
  windowControlsInset = false,
  initialSelectedId = "inbox-zero",
}: LiveSidebarProps) {
  const [groups, setGroups] = useState(agentGroups);
  const [order, setOrder] = useState<SidebarRootEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [collapsed, setCollapsed] = useState(startCollapsed);

  const ownsOpenView = (_blockId: string, itemIds: readonly string[]) =>
    selectedId !== null && itemIds.includes(selectedId);

  return (
    <AppSidebar
      windowControlsInset={windowControlsInset}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((on) => !on)}
      headerActions={chrome ? <RailActions collapsed={collapsed} /> : undefined}
      pinnedItems={[managerItem]}
      items={agentItems}
      order={order}
      groups={
        grouped
          ? groups.map((group) =>
              teams
                ? {
                    ...group,
                    icon: <TeamIcon />,
                    ...(group.collapsed
                      ? {
                          trailing: (
                            <BlockRollup count={group.itemIds.length} />
                          ),
                        }
                      : {}),
                    active: ownsOpenView(group.id, group.itemIds),
                  }
                : group,
            )
          : undefined
      }
      selectedId={selectedId}
      onSelect={setSelectedId}
      onActivateGroup={(id) =>
        setGroups((all) =>
          all.map((group) =>
            group.id === id ? { ...group, collapsed: !group.collapsed } : group,
          ),
        )
      }
      onArrange={(arrangement) => {
        setOrder(arrangement.order);
        setGroups((all) =>
          all.map((group) => ({
            ...group,
            itemIds: arrangement.members[group.id] ?? group.itemIds,
          })),
        );
        return true;
      }}
      listFooter={<AddEmployee collapsed={collapsed} />}
      footer={chrome ? <RailFoot collapsed={collapsed} /> : undefined}
    />
  );
}
