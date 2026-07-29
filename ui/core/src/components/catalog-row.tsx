"use client";

import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import { cn } from "../utils";
import {
  type CatalogRowSurface,
  catalogRowSurfaceClasses,
} from "./catalog-row-surface";

/**
 * The catalog row: ONE open target that covers the whole card, plus an optional
 * interactive `action` at the right edge (typically `CatalogAddButton`) which is
 * a sibling, never nested inside it. The `hover` fill paints the WHOLE row from
 * either, so the two still read as one row.
 *
 * "Whole card" is literal, and that is why `onClick` lives on the row's OUTER
 * element rather than on the row-body button: a row can carry a second tier
 * (`below`) that is part of the row, and a user who clicks it means "open this
 * row", not "nothing happens here". The body stays a real `<button>` so there
 * is exactly ONE focusable element owning the accessible name — its keyboard
 * activation dispatches a click that bubbles to the same handler, so pointer
 * and keyboard both fire exactly once and never twice. Everything inside
 * `action` is excluded (it is its own target with its own meaning).
 *
 * Two further slots exist for rows that carry more than one line of their own
 * content: `aside` (quiet trailing information kept OUT of the button) and
 * `below` (a second tier under the row body, INSIDE the same hover surface).
 *
 * `surface` chooses how much the row paints at REST — a flat plane in a dense
 * list, or a self-contained card. See {@link CatalogRowProps.surface}.
 */

/** Marks the `action` subtree, whose clicks belong to IT, not to the row. */
const ACTION_ATTR = "data-catalog-row-action";

/** The row's horizontal padding, shared by every tier so the `below` tier's
 *  content starts at the same x as the row's leading art. */
const ROW_PX = "px-3";

export interface CatalogRowProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children" | "onClick"> {
  /** Leading art (~40px): a brand logo, letter avatar, or glyph tile. */
  icon: ReactNode;
  title: string;
  /** The one secondary line under the title, truncated: plain muted text, or a
   *  node when the row's situation replaces its blurb (a status line on a
   *  connection that needs finishing). */
  description?: ReactNode;
  /** A tiny, always-visible status dot (e.g. `StatusDot`) rendered immediately
   *  LEFT of the title — presence-style, "● Asana" — so connected/installed
   *  state reads without hovering. */
  statusDot?: ReactNode;
  /** Quiet NON-interactive trailing inside the row body (a lock, a badge).
   *  It becomes part of the button's accessible NAME, and a button's
   *  descendants are presentational, so only put things here that belong in
   *  that name. Anything else goes in {@link CatalogRowProps.aside}. */
  trailing?: ReactNode;
  /** Quiet NON-interactive trailing rendered OUTSIDE the row button, at the
   *  row's right edge (before `action`). Use it for information that belongs to
   *  the row but not to the button's accessible name — a plan chip, a count —
   *  so assistive tech reads it as its own content instead of it being swept
   *  into (or hidden by) the button's name. Pointer events are off: it is
   *  information, never a second target. */
  aside?: ReactNode;
  /** A second tier under the row body, inside the SAME hover/focus surface and
   *  spanning the row's full width (its content starts at the leading art's
   *  left edge, not at the text column): detail that belongs to this row (live
   *  meters, a progress line). Hover and keyboard focus paint the row and this
   *  tier as one unit, so it never reads as a card stapled under a row. */
  below?: ReactNode;
  /** Interactive right-edge sibling (its own button — never nested). Clicks
   *  inside it are ITS own; they never also open the row. */
  action?: ReactNode;
  /** How the row paints itself at REST — a flat `plane` in a dense list (the
   *  default), or a self-contained clickable `card` for a row that carries its
   *  own tiers and opens the thing it describes. See {@link CatalogRowSurface}
   *  for what each one paints and why. */
  surface?: CatalogRowSurface;
  /** Open this row's detail surface. Fires once from anywhere on the card
   *  (row body, `aside`, `below`) and from keyboard activation of the row
   *  button — never from `action`. */
  onClick?: () => void;
}

/** One catalog row — the reference's GitHub-row look: flat and transparent at
 *  rest (or a hairline card, with `surface="card"`), the `hover` fill sweeping
 *  the full row, the whole card opening the item. The row body is the button
 *  that carries the row's accessible name and its focus ring; the click handler
 *  sits above it so every tier of the card is the same target. */
export function CatalogRow({
  icon,
  title,
  description,
  statusDot,
  trailing,
  aside,
  below,
  action,
  className,
  onClick,
  disabled,
  surface = "plane",
  ...rest
}: CatalogRowProps) {
  const open = disabled ? undefined : onClick;
  const paint = catalogRowSurfaceClasses(surface, open != null);
  // The row button's own click bubbles here, so the button carries no handler:
  // one handler, one fire, whether the click landed on the body, the meters, or
  // came from Enter/Space on the focused button.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(`[${ACTION_ATTR}]`)) return;
    open?.();
  };
  return (
    // Presentational on purpose: the row's ONE control is the button inside,
    // which owns the name, the focus ring and the keyboard activation. This
    // wrapper only widens where that button's click can come FROM, so it adds
    // nothing to the accessibility tree and takes no key handler of its own (a
    // key handler here would fire a second time for the same press).
    // biome-ignore lint/a11y/noStaticElementInteractions: a role that made this wrapper interactive is precisely the bug — see above.
    <div
      role="presentation"
      onClick={open ? handleClick : undefined}
      className={cn(
        // scroll-mt clears the catalog surfaces' sticky controls bar, so a
        // keyboard-focused row scrolled into view never parks hidden under it.
        // The hover/focus fill lives on THIS element so it covers the `below`
        // tier too — one row, one wash, whatever the row carries. Only the fill
        // and the press `scale` are transitioned, never layout. (`scale` is
        // named explicitly because Tailwind v4's scale-* utilities set the
        // standalone `scale` property, not `transform` — listing `transform`
        // here would silently leave the press un-eased.)
        "w-full scroll-mt-16 rounded-xl transition-[background-color,scale] hover:bg-hover focus-within:bg-hover motion-reduce:transition-none",
        paint.root,
        open && "cursor-pointer",
        className,
      )}
    >
      <div className="flex w-full items-center">
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 text-left",
            ROW_PX,
            "focus-visible:outline-none",
            paint.body,
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          {...rest}
        >
          {icon}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-medium text-ink text-sm">
              {statusDot}
              <span className="truncate">{title}</span>
            </p>
            {description && (
              <p className="truncate text-[13px] text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {trailing}
        </button>
        {aside && (
          <div className="pointer-events-none shrink-0 pr-3">{aside}</div>
        )}
        {action && (
          <div {...{ [ACTION_ATTR]: "" }} className="shrink-0 pr-2.5">
            {action}
          </div>
        )}
      </div>
      {/* Full width on the row's OWN padding, so this tier starts at the same x
          as the leading art above it, not indented to the text column. */}
      {below && <div className={cn("pb-2.5", ROW_PX)}>{below}</div>}
    </div>
  );
}
