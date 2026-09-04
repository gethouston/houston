import { Plus } from "lucide-react";
import type { ReactNode } from "react";

/** The column's header: the section's name and its live count, with the
 *  consumer's action (archive all, select all) pinned to the right. */
export function KanbanColumnHeader({
  label,
  count,
  action,
}: {
  label: string;
  count: number;
  action?: ReactNode;
}) {
  return (
    <div className="px-3 py-2.5 flex items-center justify-center relative shrink-0">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-ink">{label}</h3>
        {count > 0 && (
          <span className="text-xs text-ink-muted/60 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {action}
        </div>
      )}
    </div>
  );
}

/** The column's "+" bar, trailing the cards. Label is the accessible name
 *  only; the bar stays a glyph. */
export function KanbanColumnAdd({
  label,
  attrs,
  onClick,
}: {
  label: string;
  attrs?: Record<string, string>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      {...attrs}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center rounded-2xl border border-black/[0.06] bg-white/80 text-ink-muted/80 transition-colors hover:border-black/[0.12] hover:bg-white hover:text-ink [[data-theme=dark]_&]:border-black/70 [[data-theme=dark]_&]:bg-[#0d0d0d] [[data-theme=dark]_&]:text-ink-muted [[data-theme=dark]_&]:hover:border-black [[data-theme=dark]_&]:hover:bg-[#141414] [[data-theme=dark]_&]:hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
