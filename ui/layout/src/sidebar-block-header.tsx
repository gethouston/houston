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
  ctx: SidebarRowContext;
  contentId: string;
  collapsed: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  /** The header row was activated. The host decides what that means. */
  onActivateGroup?: (groupId: string) => void;
  onActivateDefault?: () => void;
  onDeleteGroup?: (groupId: string) => void;
  onLeaveGroup?: (groupId: string) => void;
}

/**
 * Decides WHICH affordances a block's header row carries, and hands the row
 * itself nothing but the result.
 *
 * The whole difference between a named team and the default block lives here,
 * in one branch on `group`: a named team can be edited, deleted, left and
 * dragged; the default block stands for the container every agent falls back
 * into, so it can be none of those EXCEPT edited — a host that owns the teams
 * (and only such a host) names and restyles the container itself, through the
 * same one "change icon & name" door every team has (`block.onEdit`).
 *
 * That entry is not decided here. The menu is ALWAYS constructed and handed
 * whatever the host wired plus the block's affordance mask; `SidebarGroupMenu`
 * owns the entire visibility decision, down to whether to exist at all, and
 * renders nothing when it has nothing to show. Re-deriving that here is how
 * the two block kinds start disagreeing about when a "..." appears.
 */
export function SidebarBlockHeader({
  block,
  group,
  ctx,
  contentId,
  collapsed,
  dragAttributes,
  dragListeners,
  onActivateGroup,
  onActivateDefault,
  onDeleteGroup,
  onLeaveGroup,
}: SidebarBlockHeaderProps) {
  return (
    <SidebarGroupHeader
      name={block.name}
      icon={block.icon}
      trailing={block.trailing}
      collapsed={collapsed}
      contentId={contentId}
      active={block.active}
      onActivate={group ? () => onActivateGroup?.(group.id) : onActivateDefault}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      dataAttrs={
        group
          ? { "data-sidebar-group-header": group.id }
          : { "data-sidebar-default-header": "" }
      }
      menu={
        <SidebarGroupMenu
          affordances={block.affordances}
          labels={ctx.labels}
          onOpenSettings={block.onOpenSettings}
          onEdit={block.onEdit}
          onDelete={
            group && onDeleteGroup ? () => onDeleteGroup(group.id) : undefined
          }
          onLeave={
            group && onLeaveGroup ? () => onLeaveGroup(group.id) : undefined
          }
        />
      }
    />
  );
}
