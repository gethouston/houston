import type { ReactNode } from "react"
import { cn } from "@houston-ai/core"
import { KANBAN_LIST_RAIL_CLASS_NAME, KANBAN_LIST_RAIL_LEFT_CLASS_NAME } from "./kanban-list-layout"

export interface KanbanListRailProps {
  children: ReactNode
  className?: string
  /** Sizing of the rail within its pane. "center" (default) keeps a fixed-width
   *  reading column centered; "left" fills the full pane width, left-aligned
   *  (the wide Archived list). */
  align?: "center" | "left"
}

export function KanbanListRail({ children, className, align = "center" }: KanbanListRailProps) {
  return (
    <div
      className={cn(
        align === "left" ? KANBAN_LIST_RAIL_LEFT_CLASS_NAME : KANBAN_LIST_RAIL_CLASS_NAME,
        className,
      )}
    >
      {children}
    </div>
  )
}
