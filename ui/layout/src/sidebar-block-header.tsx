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
  /** Present only for a NAMED group. Its absence is what routes the row to the
   *  default block's callback and identity. */
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
 * in one branch on `group`. A named team hands its id back when the row is
 * activated and is addressable in the DOM by it. The default block stands for
 * the container every agent falls back into: it is not a stored group, so it
 * has no id to hand back and answers through `onActivateDefault` instead.
 *
 * Everything a user can see is identical between them on purpose — the same
 * glyph column, the same disclosure, the same pill. Whether the host happens to
 * store a block is not a fact the rail should make anyone read off a row.
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
