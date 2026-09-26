import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { KeyboardEvent, ReactNode } from "react";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarGroupHeaderProps {
  name: string;
  /** The block's mark, rendered in the shared glyph column. */
  icon?: ReactNode;
  /** A badge INSIDE the row, right-aligned: the block's rollup of what its
   *  folded-away rows are signalling. */
  trailing?: ReactNode;
  affordance?: ReactNode;
  collapsed: boolean;
  /** Optional selected treatment supplied by the host. */
  active?: boolean;
  /** The row's disclosure button was activated. */
  onActivate?: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /**
   * Extra DOM attributes on the row's ROOT, not on the toggle button: they
   * identify the BLOCK (`data-sidebar-group-header="<id>"`), which is what
   * navigation and drag tests address it by.
   */
  dataAttrs?: Record<string, string>;
}

/**
 * A block's header row: ONE button carrying the block's glyph, its name, the
 * triangle that states whether it is open and an optional rollup badge.
 *
 * The row is the single hit target, announced as expanded or collapsed, and
 * the whole button toggles the fold: the triangle only states it. The row is
 * also the drag handle; @dnd-kit's pointer sensor has a 4px activation
 * distance, so a click with no movement still activates.
 */
export function SidebarGroupHeader({
  name,
  icon,
  trailing,
  affordance,
  collapsed,
  active,
  onActivate,
  dragAttributes,
  dragListeners,
  onKeyDown,
  dataAttrs,
}: SidebarGroupHeaderProps) {
  return (
    <SidebarRowButton
      label={name}
      icon={icon}
      trailing={trailing}
      affordance={affordance}
      depth="block"
      active={active}
      title={name}
      onActivate={onActivate}
      disclosure={{ expanded: !collapsed }}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      onKeyDown={onKeyDown}
      dataAttrs={dataAttrs}
    />
  );
}
