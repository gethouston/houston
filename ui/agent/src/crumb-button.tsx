/**
 * One breadcrumb segment: navigates on click, highlights as a drop target
 * for internal moves ("" = the root crumb). Sized for the header's dedicated
 * breadcrumb row, where the trail is a primary way to move around rather
 * than a caption.
 */
import { cn } from "@houston-ai/core";
import { useEffect } from "react";
import { useFolderDropTarget } from "./drop-zone";
import type { Crumb } from "./grid-utils";

export function CrumbButton({
  crumb,
  current,
  droppable,
  onNavigate,
  onDragActive,
  icon,
}: {
  crumb: Crumb;
  current: boolean;
  droppable: boolean;
  onNavigate: (path: string) => void;
  /** "" = root hovered, null = nothing hovered (see FilesBrowser). */
  onDragActive: (folder: string | null) => void;
  /** Optional leading glyph (the root crumb's home mark). */
  icon?: React.ReactNode;
}) {
  const { isOver, folderHandlers } = useFolderDropTarget();

  useEffect(() => {
    if (!droppable) return;
    onDragActive(isOver ? crumb.path : null);
  }, [isOver, droppable, crumb.path, onDragActive]);

  return (
    <button
      type="button"
      onClick={() => onNavigate(crumb.path)}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        current
          ? "font-medium text-ink"
          : "text-ink-muted hover:bg-hover hover:text-ink",
        isOver && droppable && "bg-hover ring-2 ring-focus",
      )}
      {...(droppable ? folderHandlers : {})}
    >
      {icon}
      <span className="truncate">{crumb.name}</span>
    </button>
  );
}
