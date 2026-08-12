import { AppSidebar, WorkspaceSwitcher } from "@houston-ai/layout";
import { useState } from "react";

import { moveGroup, moveItemInList, moveItemToGroup } from "./app-sidebar-move";
import { BlockRollup, TeamsBandMenu, UpdateNotice } from "./app-sidebar-stage";
import {
  agentGroups,
  agentItems,
  navEntries,
  TeamIcon,
  workspaces,
} from "./sample";

export interface LiveSidebarProps {
  /** Pass `groups` and the drag-and-drop grouped layout replaces the flat list. */
  grouped?: boolean;
  /** Give every block its glyph and name the default one. */
  teams?: boolean;
  /** Start as the 56px icon rail. The toggle stays live either way. */
  startCollapsed?: boolean;
  /** The full shell chrome: workspace switcher header, nav items, footer. */
  chrome?: boolean;
  /** Which agent opens selected — how a row starts on an already-folded team. */
  initialSelectedId?: string | null;
}

/** The default block's id for the "which block owns the open view" question;
 *  it has no group id of its own. */
const DEFAULT_BLOCK = "default";

/**
 * `AppSidebar` wired the way a host wires it: every callback moves real state,
 * so selecting, renaming, deleting, folding a team, folding the whole band and
 * reordering an agent inside its team all behave here exactly as they do in the
 * product.
 *
 * `onActivateGroup` FOLDS here, which is the simplest thing a host can do with
 * it. The library takes no position: Houston's own rail opens the team's screen
 * on most clicks and only folds when the user is already on it.
 */
export function LiveSidebar({
  grouped = false,
  teams = false,
  startCollapsed = false,
  chrome = false,
  initialSelectedId = "inbox-zero",
}: LiveSidebarProps) {
  const [items, setItems] = useState(agentItems);
  const [groups, setGroups] = useState(agentGroups);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [activeNavId, setActiveNavId] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [workspaceId, setWorkspaceId] = useState("personal");
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState(false);

  const current =
    workspaces.find((one) => one.id === workspaceId) ?? workspaces[0];

  /**
   * Does this block hold the open view? Its HEADER paints active either way:
   * a block carries no destination rows, so the header is the only row that
   * can answer the question at all.
   */
  const ownsOpenView = (_blockId: string, itemIds: readonly string[]) =>
    selectedId !== null && itemIds.includes(selectedId);

  const ungroupedIds = items
    .filter((item) => !groups.some((group) => group.itemIds.includes(item.id)))
    .map((item) => item.id);

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
      navSections={
        chrome
          ? [
              {
                id: "nav",
                items: navEntries.map((entry) => ({
                  id: entry.id,
                  label: entry.label,
                  icon: <entry.icon className="size-4" />,
                  onClick: () => setActiveNavId(entry.id),
                })),
              },
            ]
          : undefined
      }
      activeNavId={activeNavId}
      sectionLabel={teams ? "Your teams" : "Your agents"}
      sectionAction={teams ? <TeamsBandMenu /> : undefined}
      sectionCollapsed={sectionCollapsed}
      onToggleSectionCollapsed={() => setSectionCollapsed((on) => !on)}
      labels={{ addItem: "New agent" }}
      items={items}
      groups={
        grouped
          ? groups.map((group) =>
              teams
                ? {
                    ...group,
                    icon: <TeamIcon />,
                    // The rollup a folded block carries on behalf of the rows
                    // it is hiding. Open, it says nothing: those rows are on
                    // screen saying it themselves.
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
      defaultGroup={
        teams
          ? {
              name: current.name,
              icon: <TeamIcon />,
              collapsed: defaultCollapsed,
              ...(defaultCollapsed
                ? { trailing: <BlockRollup count={ungroupedIds.length} /> }
                : {}),
              active: ownsOpenView(DEFAULT_BLOCK, ungroupedIds),
            }
          : undefined
      }
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAdd={() => setSelectedId(null)}
      onActivateGroup={(id) =>
        setGroups((all) =>
          all.map((group) =>
            group.id === id ? { ...group, collapsed: !group.collapsed } : group,
          ),
        )
      }
      onActivateDefault={() => setDefaultCollapsed((on) => !on)}
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
