import { useEffect, useRef, useState } from "react"

/**
 * Counter-guarded drop-target state for a kanban column. Returns `isOver` (for
 * highlighting) plus the `dragHandlers` to spread on the column container.
 *
 * `allowDragOver` is the wider gate: any column that should NOT show the
 * browser's "forbidden" cursor while a card hovers it (real drop targets AND
 * the dragged card's own section). It defaults to `isDropTarget`. When a
 * column allows the drag-over but isn't a real target (the origin section), it
 * calls `preventDefault` so the OS shows a move cursor instead of
 * `not-allowed`, but it never highlights and the drop is a no-op. Columns that
 * disallow the drag-over get `undefined` handlers, so the browser keeps the
 * `not-allowed` cursor (e.g. the running section).
 *
 * Dragging across child cards fires nested enter/leave events; the depth
 * counter keeps the highlight from flickering. Mirrors the file-manager
 * drop-zone convention.
 */
export function useColumnDropTarget(
  isDropTarget: boolean,
  onDrop: () => void,
  allowDragOver: boolean = isDropTarget,
) {
  const [isOver, setIsOver] = useState(false)
  const depth = useRef(0)

  // When the drag ends or this column stops accepting the drag-over, clear any
  // lingering hover state so a stale highlight can't stick.
  useEffect(() => {
    if (!allowDragOver) {
      depth.current = 0
      setIsOver(false)
    }
  }, [allowDragOver])

  if (!allowDragOver) {
    return { isOver: false, dragHandlers: undefined as undefined }
  }

  return {
    // Only real drop targets light up. The origin section accepts the drag-
    // over purely so its cursor reads as a move, not a forbidden marker.
    isOver: isDropTarget ? isOver : false,
    dragHandlers: {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault()
        if (!isDropTarget) return
        depth.current += 1
        setIsOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault()
        if (!isDropTarget) return
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setIsOver(false)
        }
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        depth.current = 0
        setIsOver(false)
        // A drop on the origin section is a no-op; only real targets move.
        if (isDropTarget) onDrop()
      },
    },
  }
}
