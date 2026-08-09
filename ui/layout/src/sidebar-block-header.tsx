import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { SidebarGroupHeader } from "./sidebar-group-header";
import { SidebarGroupMenu } from "./sidebar-group-menu";
import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
} from "./sidebar-groups";
import type { SidebarRowContext } from "./sidebar-row-context";

export interface SidebarBlockHeaderProps {
  /** The block being headed: a named group, or the default block. */
  block: SidebarGroupView | SidebarDefaultGroupView;
  /** Present only for a NAMED group. Its absence is what withholds every
   *  affordance the default block does not have. */
  group?: SidebarGroupView | null;
  /** The DEFAULT block's rename commit (`SidebarDefaultGroupView.onRename`),
   *  resolved by the caller because only it knows which block `block` is.
   *  Absent — always, for a named group — means no rename and so no menu. */
  onRenameDefault?: (newName: string) => void;
  ctx: SidebarRowContext;
  contentId: string;
  collapsed: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  maxNameRunes?: number;
  /** The header row was activated. The host decides what that means. */
  onActivateGroup?: (groupId: string) => void;
  onActivateDefault?: () => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onLeaveGroup?: (groupId: string) => void;
}

/**
 * Decides WHICH affordances a block's header row carries, and hands the row
 * itself nothing but the result.
 *
 * The whole difference between a named team and the default block lives here,
 * in one branch on `group`: a named team can be renamed, deleted, left, given a
 * shared context and dragged; the default block stands for the container every
 * agent falls back into, so it can be none of those EXCEPT renamed and
 * RESTYLED — a host that owns the teams (and only such a host) names the
 * container itself, and its icon and colour are the block's identity in the
 * rail exactly as a team's are.
 *
 * Neither of those two entries is decided here. The menu is ALWAYS constructed
 * for the default block and handed whatever the host wired (`onRenameDefault`,
 * `block.identity`) plus the same affordance mask; `SidebarGroupMenu` owns the
 * entire visibility decision, down to whether to exist at all, and renders
 * nothing when it has nothing to show. Re-deriving that here is how the two
 * block kinds start disagreeing about when a "..." appears.
 */
export function SidebarBlockHeader({
  block,
  group,
  onRenameDefault,
  ctx,
  contentId,
  collapsed,
  dragAttributes,
  dragListeners,
  maxNameRunes,
  onActivateGroup,
  onActivateDefault,
  onRenameGroup,
  onDeleteGroup,
  onLeaveGroup,
}: SidebarBlockHeaderProps) {
  const renameDefault = group ? undefined : onRenameDefault;
  return (
    <SidebarGroupHeader
      name={block.name}
      icon={block.icon}
      trailing={block.trailing}
      collapsed={collapsed}
      contentId={contentId}
      active={block.active}
      labels={ctx.labels}
      onActivate={group ? () => onActivateGroup?.(group.id) : onActivateDefault}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      dataAttrs={
        group
          ? { "data-sidebar-group-header": group.id }
          : { "data-sidebar-default-header": "" }
      }
      menu={
        group
          ? (beginRename) => (
              <SidebarGroupMenu
                affordances={group.affordances}
                labels={ctx.labels}
                identity={group.identity}
                onStartRename={onRenameGroup ? beginRename : undefined}
                onDelete={onDeleteGroup && (() => onDeleteGroup(group.id))}
                onLeave={onLeaveGroup && (() => onLeaveGroup(group.id))}
              />
            )
          : (beginRename) => (
              <SidebarGroupMenu
                affordances={block.affordances}
                labels={ctx.labels}
                identity={block.identity}
                onStartRename={renameDefault ? beginRename : undefined}
              />
            )
      }
      rename={
        group && onRenameGroup
          ? {
              maxRunes: maxNameRunes,
              onCommit: (newName) => onRenameGroup(group.id, newName),
            }
          : renameDefault
            ? {
                // No `startRenaming` and no `onCancel`: the default block is
                // never freshly created, so nothing ever opens it straight into
                // the field and an abandoned edit has no draft to retire.
                maxRunes: maxNameRunes,
                onCommit: renameDefault,
              }
            : undefined
      }
    />
  );
}
