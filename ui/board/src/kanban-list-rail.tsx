import type { ReactNode } from "react"
import { cn } from "@houston-ai/core"
import { KANBAN_LIST_RAIL_CLASS_NAME } from "./kanban-list-layout"

export interface KanbanListRailProps {
  children: ReactNode
  className?: string
}

export function KanbanListRail({ children, className }: KanbanListRailProps) {
  return (
    <div className={cn(KANBAN_LIST_RAIL_CLASS_NAME, className)}>
      {children}
    </div>
  )
}
