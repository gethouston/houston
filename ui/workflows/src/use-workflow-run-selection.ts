import { useEffect, useMemo, useState } from "react"
import type { WorkflowRun } from "./types"
import { activeRun } from "./workflow-dag"

/** Pick which run the editor shows — in-flight wins, else user selection, else latest. */
export function useWorkflowRunSelection(
  workflowId: string | undefined,
  runs: WorkflowRun[],
) {
  const workflowRuns = useMemo(
    () =>
      workflowId
        ? runs
            .filter((r) => r.workflow_id === workflowId)
            .sort(
              (a, b) =>
                new Date(b.started_at).getTime() -
                new Date(a.started_at).getTime(),
            )
        : [],
    [runs, workflowId],
  )

  const inFlight = workflowId ? activeRun(runs, workflowId) : undefined
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedRunId(null)
  }, [workflowId])

  useEffect(() => {
    if (inFlight) setSelectedRunId(inFlight.id)
  }, [inFlight?.id])

  const selectedRun = useMemo(() => {
    if (selectedRunId) {
      const hit = workflowRuns.find((r) => r.id === selectedRunId)
      if (hit) return hit
    }
    return workflowRuns[0]
  }, [selectedRunId, workflowRuns])

  return {
    workflowRuns,
    inFlight,
    selectedRun,
    /** Effective id for history highlight (includes fallback to latest run). */
    selectedRunId: selectedRun?.id ?? null,
    /** Raw user/in-flight selection — null when only showing latest-run fallback. */
    explicitRunId: selectedRunId,
    selectRun: setSelectedRunId,
  }
}
