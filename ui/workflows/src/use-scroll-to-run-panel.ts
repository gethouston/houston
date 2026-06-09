import { useEffect, type RefObject } from "react"

/** Scroll the editor body to the active run panel when execution is focused. */
export function useScrollToRunPanel(
  panelRef: RefObject<HTMLElement | null>,
  explicitRunId: string | null,
) {
  useEffect(() => {
    if (!explicitRunId) return
    const frame = requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    })
    return () => cancelAnimationFrame(frame)
  }, [explicitRunId, panelRef])
}
