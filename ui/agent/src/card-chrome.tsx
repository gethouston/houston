/**
 * Shared chrome for the Drive-style cards: the wrapper that keeps the kebab
 * OUT of the interactive card surface (a role="button" prunes its children
 * from assistive tech), the card shell classes, the meta footer row, and the
 * always-visible kebab menu button.
 */
import { cn } from "@houston-ai/core";
import { EllipsisVertical } from "lucide-react";
import type { ReactNode } from "react";

export const MENU_WIDTH = 160;

/** Card padding, in step with the preview panel's inset (concentric radii). */
const CARD_PAD = "px-2";

/**
 * Card wrapper: positions the kebab as a SIBLING of the interactive surface,
 * so the button stays reachable by assistive tech instead of being pruned as
 * a presentational child.
 */
export function CardShell({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
}

/** Absolute slot for the kebab, pinned to the card's top-right corner. */
export function CardActions({ children }: { children: ReactNode }) {
  return <div className="absolute top-1.5 right-1.5 z-10">{children}</div>;
}

/** Shared card shell classes: borderless, filled with a soft chip tone. */
export function cardClass(opts: {
  selected?: boolean;
  dropTarget?: boolean;
  dragging?: boolean;
}) {
  return cn(
    "group flex flex-col overflow-hidden rounded-xl bg-chip-subtle/60 text-card-text outline-none transition-colors select-none",
    opts.selected
      ? "bg-chip-subtle ring-2 ring-action"
      : "hover:bg-chip-subtle focus-visible:ring-2 focus-visible:ring-focus",
    opts.dropTarget && "ring-2 ring-focus",
    opts.dragging && "opacity-40",
  );
}

/**
 * Card header row (type glyph + name). `withActions` reserves the room the
 * kebab occupies in the card's actions slot, so a long name never runs under
 * it.
 */
export function cardHeaderClass(withActions?: boolean) {
  return cn(
    "flex h-10 shrink-0 items-center gap-2",
    CARD_PAD,
    withActions && "pr-9",
  );
}

/**
 * Inner thumbnail/glyph panel: a paper surface recessed into the card.
 * Inset 8px on every side, so the panel lines up with the header and meta
 * text, and the 4px inner radius stays concentric with the card's 12px.
 */
export const cardPreviewClass = "mx-2 h-28 overflow-hidden rounded-sm bg-input";

/** Bottom meta row: modified date on the left, optional count on the right. */
export function CardMeta({ left, right }: { left: string; right?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 pt-1.5 pb-2 text-xs text-ink-muted tabular-nums",
        CARD_PAD,
      )}
    >
      <span className="truncate">{left}</span>
      {right !== undefined && <span className="shrink-0">{right}</span>}
    </div>
  );
}

/** Always-visible actions button; reports where the menu should open. */
export function KebabButton({
  label,
  onOpen,
}: {
  label?: string;
  onOpen: (position: { x: number; y: number }) => void;
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
      className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <EllipsisVertical aria-hidden className="size-4" />
    </button>
  );
}
