//! Synthesis turn — aggregate step summaries into a run-level result.

use crate::workflows::dispatcher::{DispatchOutcome, SynthesisContext, WorkflowDispatcher};
use crate::workflows::types::{Workflow, WorkflowRun, WorkflowStep};
use std::sync::Arc;

pub fn build_synthesis_prompt(workflow: &Workflow, plan_steps: &[WorkflowStep], run: &WorkflowRun) -> String {
    let mut lines = vec![
        format!("Workflow: {}", workflow.name),
        "Summarize what was actually completed below into a concise final report for the user. \
Report concrete outcomes (created files, sent messages, links). \
Do not say approval is still pending for steps already marked done. \
Write the report in the same language as the workflow plan and task descriptions below.".into(),
        String::new(),
    ];
    for step in plan_steps {
        let state = run
            .steps
            .iter()
            .find(|s| s.step_id == step.id);
        let status = state.map(|s| s.status.as_str()).unwrap_or("pending");
        let summary = state
            .and_then(|s| s.summary.as_deref())
            .unwrap_or("(no output)");
        lines.push(format!("- [{}] {} (status={}): {}", step.id, step.task, status, summary));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::types::{StepState, Workflow, WorkflowPlan, WorkflowRun, WorkflowStep};

    #[test]
    fn build_synthesis_prompt_requires_same_language_as_plan() {
        let workflow = Workflow {
            id: "wf-1".into(),
            name: "Auditoría".into(),
            description: String::new(),
            plan_prompt: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let steps = vec![WorkflowStep {
            id: "audit".into(),
            task: "Revisar el repositorio".into(),
            provider: None,
            model: None,
            effort: None,
            use_worktree: false,
            depends_on: vec![],
            requires_approval: false,
        }];
        let run = WorkflowRun {
            id: "run-1".into(),
            workflow_id: "wf-1".into(),
            status: "running".into(),
            session_key: "workflow-wf-1-run-run-1".into(),
            plan: Some(WorkflowPlan {
                steps: steps.clone(),
            }),
            steps: vec![StepState {
                step_id: "audit".into(),
                status: "done".into(),
                approved: false,
                summary: Some("Se encontraron 3 problemas".into()),
                worktree_path: None,
            }],
            summary: None,
            started_at: String::new(),
            completed_at: None,
            plan_prompt: None,
            name: None,
            description: None,
        };

        let prompt = build_synthesis_prompt(&workflow, &steps, &run);
        assert!(prompt.contains(
            "Write the report in the same language as the workflow plan and task descriptions below."
        ));
        assert!(prompt.contains("Revisar el repositorio"));
    }
}
