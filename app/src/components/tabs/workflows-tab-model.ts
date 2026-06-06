import type { Workflow, WorkflowFormData } from "@houston-ai/workflows";
import type { WorkflowRun } from "@houston-ai/engine-client";

/** Editor view state for the Workflows tab. */
export type View = { type: "grid" } | { type: "editor"; editId?: string };

/** Most recent run per workflow id, keyed by `workflow_id`. */
export function latestRunByWorkflow(
  runs: WorkflowRun[] | undefined,
): Record<string, WorkflowRun> {
  if (!runs) return {};
  const map: Record<string, WorkflowRun> = {};
  for (const run of runs) {
    const existing = map[run.workflow_id];
    if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
      map[run.workflow_id] = run;
    }
  }
  return map;
}

/** Blank form for "create new workflow" and the reset target on agent switch. */
export const EMPTY_FORM: WorkflowFormData = {
  name: "",
  description: "",
  plan_prompt: "",
};

/** True when `form` has no edits relative to `source`. Gates the Save button. */
export function formMatchesWorkflow(
  form: WorkflowFormData,
  source: WorkflowFormData,
): boolean {
  return (
    form.name === source.name &&
    form.description === source.description &&
    form.plan_prompt === source.plan_prompt
  );
}

/** Project a stored workflow onto the editor's form shape. */
export function workflowToFormData(workflow: Workflow): WorkflowFormData {
  return {
    name: workflow.name,
    description: workflow.description,
    plan_prompt: workflow.plan_prompt,
  };
}

/**
 * Fresh Workflows-tab state: grid view, blank form + baseline.
 *
 * Used both for the initial mount and when the active agent changes. The tab
 * instance is reused across agents, so switching agents drops any in-progress
 * edit and returns to that agent's grid.
 */
export function freshWorkflowsState(): {
  view: View;
  form: WorkflowFormData;
  baseline: WorkflowFormData;
} {
  return { view: { type: "grid" }, form: EMPTY_FORM, baseline: EMPTY_FORM };
}
