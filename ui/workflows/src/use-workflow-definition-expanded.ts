import { useEffect, useState } from "react"

/** Collapse definition on explicit run focus; manual toggle until next focus change. */
export function useWorkflowDefinitionExpanded(explicitRunId: string | null) {
  const [definitionExpanded, setDefinitionExpanded] = useState(true)

  useEffect(() => {
    if (explicitRunId) setDefinitionExpanded(false)
  }, [explicitRunId])

  return {
    definitionExpanded,
    setDefinitionExpanded,
    toggleDefinition: () => setDefinitionExpanded((open) => !open),
  }
}
