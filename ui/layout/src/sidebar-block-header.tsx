import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { SidebarGroupHeader } from "./sidebar-group-header";
import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
} from "./sidebar-groups";

export interface SidebarBlockHeaderProps {
  /** The block being headed: a named group, or the default block. */
  block: SidebarGroupView | SidebarDefaultGroupView;
  /** Present only for a NAMED group. Its absence is what withholds every
   *  affordance the default block does not have. */
  group?: SidebarGroupView | null;
  contentId: string;
  collapsed: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  /** The header row was activated. The host decides what that means. */
  onActivateGroup?: (groupId: string) => void;
  onActivateDefault?: () => void;
}

/**
 * Renders either kind of block through the same header row.
 *
 * The whole difference between a named team and the default block lives here,
 * in one branch on `group`: a named team can be edited, deleted, left and
 * dragged; the default block stands for the container every agent falls back
 * into, so it can be none of those EXCEPT edited — a host that owns the teams
 * (and only such a host) names and restyles the container itself, through the
 * same one "change icon & name" door every team has (`block.onEdit`).
 *
 * That entry is not decided here. The menu is ALWAYS constructed and handed
 */
export function SidebarBlockHeader({
  block,
  group,
  contentId,
  collapsed,
  dragAttributes,
  dragListeners,
  onActivateGroup,
  onActivateDefault,
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
    />
  );
}
