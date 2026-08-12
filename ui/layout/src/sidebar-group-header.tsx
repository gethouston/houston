import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { ReactNode } from "react";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarGroupHeaderProps {
  name: string;
  /** The block's mark, rendered in the shared glyph column. */
  icon?: ReactNode;
  /** A badge INSIDE the row, right-aligned: the block's rollup of what its
   *  folded-away rows are signalling. */
  trailing?: ReactNode;
  collapsed: boolean;
  /** The id of the region this row folds, wired as `aria-controls`. Omitted by
   *  the drag preview, which folds nothing. */
  contentId?: string;
  /**
   * Painted as the selected row. A block carries no destination rows any more,
   * so this row is the only one that can say the open view belongs here —
   * folded or open alike.
   */
  active?: boolean;
  /** The row was activated. Whether that opens the block's screen, folds it, or
   *  both is entirely the host's decision; this component only reports it. */
  onActivate?: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
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
 * Three things about that shape are deliberate:
 *
 * - **One button, not three.** The triangle, the glyph and the name used to be
 *   separate controls sharing one job, which gave a keyboard user three stops
 *   to reach one disclosure and gave a screen reader no `aria-expanded` at all.
 *   Now the row IS the single hit target, announced as expanded or collapsed,
 *   pointing at the region it folds through `aria-controls`.
 * - **The triangle is an INDICATOR, not a control.** It states the block's
 *   fold and nothing else. What activating the row does is the host's rule —
 *   it may open the block's screen rather than fold it — so a triangle that
 *   claimed to be the fold button would be promising an outcome it does not
 *   own.
 * The row is also the drag handle, exactly as before. @dnd-kit's pointer sensor
 * has a 4px activation distance, so a click with no movement still activates.
 */
export function SidebarGroupHeader({
  name,
  icon,
  trailing,
  collapsed,
  contentId,
  active,
  onActivate,
  dragAttributes,
  dragListeners,
  dataAttrs,
}: SidebarGroupHeaderProps) {
  return (
    <SidebarRowButton
      label={name}
      icon={icon}
      trailing={trailing}
      depth="block"
      active={active}
      title={name}
      onActivate={onActivate}
      disclosure={{ expanded: !collapsed, contentId }}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      dataAttrs={dataAttrs}
    />
  );
}
