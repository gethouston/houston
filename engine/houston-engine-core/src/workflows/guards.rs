//! Per-run budget and recursion guards for workflow plans.

use crate::error::{CoreError, CoreResult};
use crate::workflows::types::WorkflowPlan;

/// Hard cap on steps per workflow run (enforced before approval).
pub const MAX_STEPS_PER_RUN: usize = 20;

/// Subagent steps run at depth 1; nested workflow triggers are rejected.
pub const MAX_RECURSION_DEPTH: u8 = 1;

const NESTED_WORKFLOW_MARKERS: &[&str] = &[
    "spawn workflow",
    "run workflow",
    "trigger workflow",
    "nested workflow",
    "start workflow",
];

/// Reject plans that exceed step budget or would recurse past [`MAX_RECURSION_DEPTH`].
pub fn enforce_run_limits(plan: &WorkflowPlan) -> CoreResult<()> {
    if plan.steps.len() > MAX_STEPS_PER_RUN {
        return Err(CoreError::BadRequest(format!(
            "workflow plan exceeds max step count ({MAX_STEPS_PER_RUN})"
        )));
    }
    for step in &plan.steps {
        if step_would_recurse(&step.task) {
            return Err(CoreError::BadRequest(format!(
                "step {} would exceed workflow recursion depth limit",
                step.id
            )));
        }
    }
    Ok(())
}

fn step_would_recurse(task: &str) -> bool {
    let lower = task.to_lowercase();
    NESTED_WORKFLOW_MARKERS.iter().any(|m| lower.contains(m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::types::WorkflowStep;

    fn plan_with_steps(n: usize) -> WorkflowPlan {
        WorkflowPlan {
            steps: (0..n)
                .map(|i| WorkflowStep {
                    id: format!("s{i}"),
                    task: format!("task {i}"),
                    provider: None,
                    model: None,
                    effort: None,
                    use_worktree: false,
                    depends_on: vec![],
                })
                .collect(),
        }
    }

    #[test]
    fn accepts_plan_within_limits() {
        enforce_run_limits(&plan_with_steps(5)).unwrap();
    }

    #[test]
    fn rejects_too_many_steps() {
        assert!(matches!(
            enforce_run_limits(&plan_with_steps(MAX_STEPS_PER_RUN + 1)).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn rejects_nested_workflow_task() {
        let plan = WorkflowPlan {
            steps: vec![WorkflowStep {
                id: "a".into(),
                task: "Please run workflow on the subfolder".into(),
                provider: None,
                model: None,
                effort: None,
                use_worktree: false,
                depends_on: vec![],
            }],
        };
        assert!(matches!(
            enforce_run_limits(&plan).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }
}
