/**
 * One breadcrumb segment: navigates on click, highlights as a drop target
 * for internal moves ("" = the root crumb).
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
  children,
}: {
  crumb: Crumb;
  current: boolean;
  droppable: boolean;
  onNavigate: (path: string) => void;
  onDragActive: (folder: string | null) => void;
  /** Icon-only crumbs (the home root) render children instead of the name. */
  children?: React.ReactNode;
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
      aria-label={children ? crumb.name : undefined}
      title={children ? crumb.name : undefined}
      className={cn(
        "min-w-0 truncate rounded-md px-1.5 py-0.5 text-[13px] transition-colors",
        current
          ? "font-medium text-ink"
          : "text-ink-muted hover:bg-hover hover:text-ink",
        isOver && droppable && "bg-hover ring-1 ring-focus",
      )}
      {...(droppable ? folderHandlers : {})}
    >
      {children ?? crumb.name}
    </button>
  );
}
