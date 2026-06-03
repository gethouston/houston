import { useEffect, useRef, useState } from "react"

/**
 * Counter-guarded drop-target state for a kanban column. Returns `isOver` (for
 * highlighting) plus the `dragHandlers` to spread on the column container —
 * only while the column is an active target for the in-flight drag, `undefined`
 * otherwise so the column ignores drags it can't accept.
 *
 * Dragging across child cards fires nested enter/leave events; the depth
 * counter keeps the highlight from flickering. Mirrors the file-manager
 * drop-zone convention.
 */
export function useColumnDropTarget(isDropTarget: boolean, onDrop: () => void) {
  const [isOver, setIsOver] = useState(false)
  const depth = useRef(0)

  // When the drag ends or this column stops being a valid target, clear any
  // lingering hover state so a stale highlight can't stick.
  useEffect(() => {
    if (!isDropTarget) {
      depth.current = 0
      setIsOver(false)
    }
  }, [isDropTarget])

  if (!isDropTarget) {
    return { isOver: false, dragHandlers: undefined as undefined }
  }

  return {
    isOver,
    dragHandlers: {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault()
        depth.current += 1
        setIsOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault()
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
        onDrop()
      },
    },
  }
}
