/**
 * Shared chrome for the Drive-style cards: outer card classes, the meta
 * footer row, and the always-visible kebab menu button.
 */
import { cn } from "@houston-ai/core";
import { EllipsisVertical } from "lucide-react";

export const MENU_WIDTH = 160;

/** Shared card shell classes: borderless, filled with a soft chip tone. */
export function cardClass(opts: {
  selected?: boolean;
  dropTarget?: boolean;
  dragging?: boolean;
}) {
  return cn(
    "group flex flex-col overflow-hidden rounded-xl bg-chip-subtle/60 text-card-text outline-none transition-colors select-none",
    opts.selected
      ? "bg-chip-subtle ring-1 ring-action"
      : "hover:bg-chip-subtle focus-visible:ring-1 focus-visible:ring-focus",
    opts.dropTarget && "ring-2 ring-focus",
    opts.dragging && "opacity-40",
  );
}

/** Inner thumbnail/glyph panel: a paper surface recessed into the card. */
export const cardPreviewClass =
  "mx-1.5 h-28 overflow-hidden rounded-lg bg-input";

/** Bottom meta row: modified date on the left, optional count on the right. */
export function CardMeta({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-1.5 pb-2 text-[11px] text-ink-muted">
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
      className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
    >
      <EllipsisVertical aria-hidden className="size-4" />
    </button>
  );
}
