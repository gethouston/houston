//! Synthesis turn — aggregate step summaries into a run-level result.

use crate::workflows::dispatcher::{DispatchOutcome, SynthesisContext, WorkflowDispatcher};
use crate::workflows::types::{Workflow, WorkflowRun, WorkflowStep};
use std::sync::Arc;

pub fn build_synthesis_prompt(workflow: &Workflow, plan_steps: &[WorkflowStep], run: &WorkflowRun) -> String {
    let mut lines = vec![
        format!("Workflow: {}", workflow.name),
        "Summarize the completed steps below into a concise final report for the user.".into(),
        String::new(),
    ];
    for step in plan_steps {
        let state = run
            .steps
            .iter()
            .find(|s| s.step_id == step.id);
        let summary = state
            .and_then(|s| s.summary.as_deref())
            .unwrap_or("(no output)");
        lines.push(format!("- [{}] {}: {}", step.id, step.task, summary));
    }
    lines.join("\n")
}

pub async fn run_synthesis(
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    working_dir: &std::path::Path,
    workflow: &Workflow,
    run: &WorkflowRun,
) -> DispatchOutcome {
    let plan = match &run.plan {
        Some(p) => p,
        None => {
            return DispatchOutcome {
                response_text: String::new(),
                error: Some("workflow run has no plan".into()),
            };
        }
    };
    let prompt = build_synthesis_prompt(workflow, &plan.steps, run);
    dispatcher
        .dispatch_synthesis(SynthesisContext {
            agent_path,
            working_dir,
            workflow,
            run,
            prompt: &prompt,
        })
        .await
}
