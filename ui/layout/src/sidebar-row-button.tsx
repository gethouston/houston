import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { cn } from "@houston-ai/core";
import type { KeyboardEvent, ReactNode } from "react";
import { sidebarRowType } from "./sidebar-geometry";
import { sidebarRowButtonClasses as c, sidebarRowState } from "./sidebar-paint";

/** Where the row sits in the ladder, which is the whole of its indent. */
export type SidebarRowDepth = "block" | "child";

export interface SidebarRowDisclosure {
  expanded: boolean;
  /** The region this row folds, wired as `aria-controls`. */
  contentId?: string;
}

/**
 * The disclosure mark: a small SOLID triangle sitting immediately after the
 * label, pointing right when the row is folded and rotating a quarter turn to
 * point down when it opens.
 *
 * Drawn here, in five numbers, rather than pulled from an icon set: no set
 * ships this shape at this weight (an outline chevron is a different mark — it
 * reads as "there is more over there", where a filled triangle reads as "this
 * thing is closed"), and a whole dependency for one path would be absurd.
 *
 * The path is centred on the 16-unit box in BOTH axes (x 5.5-10.5, y 4.5-11.5),
 * which is what lets a plain 90-degree rotation about the box centre keep the
 * mark optically still while it turns.
 */
function SidebarRowCaret({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn(c.caret, expanded && "rotate-90")}
    >
      <path d="M5.5 4.5 L10.5 8 L5.5 11.5 Z" />
    </svg>
  );
}

export interface SidebarRowButtonProps {
  label: string;
  /** The leading node in the shared 20px box: a Lucide glyph, or an avatar. */
  icon?: ReactNode;
  /** Default `child`. `block` heads a block and sits one step to the left. */
  depth?: SidebarRowDepth;
  /**
   * This row NAMES the list rather than pointing at anything ("Your teams").
   * One type step down (12px) and never carries a block head's weight — a band
   * that shouts is the fastest way to make a rail look like a settings form.
   */
  band?: boolean;
  /** Quieter resting label, for a row that names things rather than opening
   *  one (the section band, the trailing "new" row). */
  muted?: boolean;
  /**
   * Selected. Paints the pill AND says so, via `aria-current="page"` — a fill
   * with no announced counterpart is a state only sighted users can read.
   */
  active?: boolean;
  /** Makes the row a DISCLOSURE. Omit for a row that simply activates. */
  disclosure?: SidebarRowDisclosure;
  onActivate?: () => void;
  /** Keys the row itself answers (Delete / Backspace on a focused agent row).
   *  Activation is `onActivate`; this is for everything else. */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** Right-aligned INSIDE the button: counts, badges, status dots. */
  trailing?: ReactNode;
  /**
   * Right-aligned OUTSIDE the button: a "..." menu trigger, a "+". A sibling
   * and not a child because a button may not nest inside a button, which is
   * also why it survives the row swapping into an input.
   */
  affordance?: ReactNode;
  /**
   * The row is a drag HANDLE. Implied by `dragListeners`; passed explicitly by
   * a row whose listeners live on a wrapper (the sortable agent rows), which
   * would otherwise show a pointer cursor over a draggable object.
   */
  draggable?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  /** DOM attributes on the row ROOT: test ids, tour anchors. */
  dataAttrs?: Record<string, string>;
  /** Native title, for a label whose full text is worth hovering for. */
  title?: string;
}

/**
 * THE sidebar row.
 *
 * Every interactive line in the rail is one of these: the top-level
 * destinations, the "Your teams" band, each team's header, each team's
 * destination rows, each agent, and the "New agent" row that closes the list.
 * One component, so they cannot drift.
 *
 * The anatomy it owns, left to right: a fixed-height box (28px, and no state
 * may change it), a 20px glyph column, a truncating label, an optional trailing
 * slot inside the button, and an optional affordance beside it. Plus exactly
 * two behaviours, which are the only two a rail row ever has:
 *
 * - **activate** — `onActivate`, and when `active` the pill plus
 *   `aria-current="page"`;
 * - **disclose** — `disclosure`, which adds the rotating triangle after the
 *   label, `aria-expanded` and `aria-controls`.
 *
 * A row can be BOTH: a collapsed team block discloses its contents and is
 * simultaneously the active row, standing in for the destination row it is
 * hiding.
 *
 * What it deliberately does NOT own: the icon-only collapsed rail (a different
 * anatomy with flyouts, not a narrower version of this one) and inline rename
 * (the consumer swaps the whole row for an input, because a text field is not a
 * state of a button).
 */
export function SidebarRowButton({
  label,
  icon,
  depth = "child",
  band,
  muted,
  active,
  disclosure,
  onActivate,
  onKeyDown,
  trailing,
  affordance,
  draggable,
  dragAttributes,
  dragListeners,
  dataAttrs,
  title,
}: SidebarRowButtonProps) {
  return (
    <div
      className={cn(
        c.root,
        active ? sidebarRowState.active : sidebarRowState.hover,
      )}
      {...(dataAttrs ?? {})}
    >
      <button
        type="button"
        title={title}
        aria-current={active ? "page" : undefined}
        aria-expanded={disclosure ? disclosure.expanded : undefined}
        aria-controls={disclosure?.contentId}
        onClick={onActivate}
        onKeyDown={onKeyDown}
        className={cn(
          c.button,
          band ? sidebarRowType.band : sidebarRowType.item,
          depth === "block" ? c.depthBlock : c.depthChild,
          active
            ? "text-ink"
            : muted
              ? "text-ink-muted"
              : sidebarRowState.restText,
          (draggable || dragListeners) && c.draggable,
        )}
        {...dragAttributes}
        {...dragListeners}
      >
        {icon !== undefined && <span className={c.icon}>{icon}</span>}
        <span className={c.labelGroup}>
          <span className={c.label}>{label}</span>
          {disclosure && <SidebarRowCaret expanded={disclosure.expanded} />}
        </span>
        <span className={c.spacer} />
        {trailing && <span className={c.trailing}>{trailing}</span>}
      </button>
      {affordance}
    </div>
  );
}
