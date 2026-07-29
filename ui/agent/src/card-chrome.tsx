/**
 * Shared chrome for the Drive-style grid: the wrapper that keeps the kebab
 * OUT of the interactive surface (a role="button" prunes its children from
 * assistive tech), the hero file-card shell, the one-line folder-chip shell,
 * and the always-visible kebab menu button.
 */
import { cn } from "@houston-ai/core";
import { EllipsisVertical } from "lucide-react";
import type { ReactNode } from "react";

export const MENU_WIDTH = 160;

/** Card padding, in step with the preview panel's inset (concentric radii). */
const CARD_PAD = "px-2";

/** Room the kebab occupies, so a long name never runs under it. */
const KEBAB_GUTTER = "pr-9";

/**
 * Card wrapper: positions the kebab as a SIBLING of the interactive surface,
 * so the button stays reachable by assistive tech instead of being pruned as
 * a presentational child.
 */
export function CardShell({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
}

/**
 * Absolute slot for the kebab: the card's top-right corner, or vertically
 * centered on a chip, whose whole content is one row.
 */
export function CardActions({
  children,
  center,
}: {
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute right-1.5 z-10",
        center ? "inset-y-0 flex items-center" : "top-1.5",
      )}
    >
      {children}
    </div>
  );
}

export interface SurfaceState {
  dropTarget?: boolean;
  dragging?: boolean;
}

/**
 * Fill, hover and drag states shared by cards and chips. There is no selected
 * state: a click on a card OPENS it, so nothing on the grid ever sits
 * highlighted-and-idle waiting for a second gesture.
 */
function surfaceClass(opts: SurfaceState) {
  return cn(
    "group bg-chip-subtle/60 text-card-text outline-none transition-colors select-none",
    "hover:bg-chip-subtle focus-visible:ring-2 focus-visible:ring-focus",
    opts.dropTarget && "ring-2 ring-focus",
    opts.dragging && "opacity-40",
  );
}

/**
 * Hero file card: a title row on top and a preview panel that takes the whole
 * rest of the card, so the thumbnail is what the eye lands on.
 */
export function cardClass(opts: SurfaceState) {
  return cn(
    "flex h-64 flex-col overflow-hidden rounded-xl",
    surfaceClass(opts),
  );
}

/** One-line folder chip: glyph + name + trailing kebab, nothing else. */
export function chipClass(opts: SurfaceState) {
  return cn(
    "flex h-12 items-center gap-2 overflow-hidden rounded-xl pl-3",
    KEBAB_GUTTER,
    surfaceClass(opts),
  );
}

/**
 * Card header row (type glyph + name). `withActions` reserves the room the
 * kebab occupies in the card's actions slot.
 */
export function cardHeaderClass(withActions?: boolean) {
  return cn(
    "flex h-10 shrink-0 items-center gap-2",
    CARD_PAD,
    withActions && KEBAB_GUTTER,
  );
}

/**
 * Inner thumbnail/glyph panel: a paper surface recessed into the card, taking
 * every pixel the header leaves. Inset 8px on every side, so it lines up with
 * the header text and its 4px radius stays concentric with the card's 12px.
 */
export const cardPreviewClass =
  "mx-2 mb-2 min-h-0 flex-1 overflow-hidden rounded-sm bg-input";

/** Always-visible actions button; reports where the menu should open. */
export function KebabButton({
  label,
  onOpen,
  className,
}: {
  label?: string;
  onOpen: (position: { x: number; y: number }) => void;
  /** Lets a list row hold the glyph quieter at rest than a card's does. */
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label ?? "More actions"}
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen({ x: Math.max(8, rect.right - MENU_WIDTH), y: rect.bottom + 4 });
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
    >
      <EllipsisVertical aria-hidden className="size-4" />
    </button>
  );
}
