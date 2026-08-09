import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { ReactNode } from "react";
import type { SidebarLabels } from "./sidebar";
import { useGroupRename } from "./sidebar-group-rename";
import {
  sidebarRowAffordanceGutter,
  sidebarRowButtonClasses,
} from "./sidebar-paint";
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
  labels: Required<SidebarLabels>;
  /**
   * Painted as the selected row. A block carries no destination rows any more,
   * so this row is the only one that can say the open view belongs here —
   * folded or open alike.
   */
  active?: boolean;
  /** The row was activated. Whether that opens the block's screen, folds it, or
   *  both is entirely the host's decision; this component only reports it. */
  onActivate?: () => void;
  /**
   * The "..." menu. Absent for a block that owns no affordances — the default
   * team on a host that does not let its name be changed.
   *
   * A render prop rather than a plain node because the menu's Rename entry has
   * to open the inline rename this component owns. Handing the caller
   * `beginRename` keeps the session in one place and still leaves the header
   * knowing nothing about what the menu contains.
   */
  menu?: (beginRename: () => void) => ReactNode;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  /** Inline rename. Absent means the name is not editable from the rail. */
  rename?: {
    /** Ceiling in RUNES; absent means no cap. */
    maxRunes?: number;
    onCommit: (newName: string) => void;
    /** The session ended without committing. Fires EXACTLY once. Absent when
     *  there is nothing to undo — the default block renames an existing name,
     *  where a named group's rename may be retiring a never-created draft. */
  };
  /**
   * Extra DOM attributes on the row's ROOT, not on the toggle button: they
   * identify the BLOCK (`data-sidebar-group-header="<id>"`), which is what
   * navigation and drag tests address it by, and that identity has to survive
   * the row swapping into its rename input.
   */
  dataAttrs?: Record<string, string>;
}

const NOOP = () => {};

/**
 * A block's header row: ONE button carrying the block's glyph, its name, the
 * triangle that states whether it is open and an optional rollup badge, with
 * the "..." menu as a sibling.
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
 * - **The menu is a SIBLING**, because a button may not nest inside a button.
 *   It is always rendered, muted, and strengthens on hover / focus / open:
 *   Houston forbids hover-GATED affordances, since a control that exists only
 *   under the cursor is unreachable by touch and invisible to anyone scanning.
 *
 * The row is also the drag handle, exactly as before. @dnd-kit's pointer sensor
 * has a 4px activation distance, so a click with no movement still activates.
 */
export function SidebarGroupHeader({
  name,
  icon,
  trailing,
  collapsed,
  contentId,
  labels,
  active,
  onActivate,
  menu,
  dragAttributes,
  dragListeners,
  rename,
  dataAttrs,
}: SidebarGroupHeaderProps) {
  // Hooks may not be conditional, so a block with no rename affordance still
  // runs the session with inert callbacks and simply never begins one.
  const session = useGroupRename({
    name,
    maxRunes: rename?.maxRunes,
    onCommit: rename?.onCommit ?? NOOP,
    onCancel: NOOP,
  });

  if (session.renaming) {
    return (
      <div className={sidebarRowButtonClasses.root} {...(dataAttrs ?? {})}>
        <input
          ref={session.inputRef}
          value={session.draft}
          placeholder={labels.newGroupPlaceholder}
          onChange={(e) => session.setDraft(e.target.value)}
          onBlur={() => session.end(true)}
          onKeyDown={(e) => {
            // Keep every keystroke in the field: the sortable wrapper spreads
            // @dnd-kit's keyboard activators, whose Space/Enter would otherwise
            // start a drag mid-type and swallow the character.
            e.stopPropagation();
            if (e.key === "Enter") session.end(true);
            if (e.key === "Escape") session.end(false);
          }}
          className={sidebarRowButtonClasses.input}
        />
      </div>
    );
  }

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
      affordance={
        // A block with no menu still reserves the affordance column: it sits in
        // a stack of blocks that HAVE one, and a name that gets 28px more room
        // on one row truncates at a different point from every other team's,
        // which reads as a second list.
        menu?.(session.begin) ?? (
          <span aria-hidden="true" className={sidebarRowAffordanceGutter} />
        )
      }
    />
  );
}
