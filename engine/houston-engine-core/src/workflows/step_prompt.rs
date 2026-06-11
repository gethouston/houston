//! Step-execution prompt and system appendix for workflow fan-out.

use crate::workflows::types::{Workflow, WorkflowRun, WorkflowStep};

pub const STEP_SYSTEM_APPENDIX: &str = "\n\n---\n\
# Workflow step turn (internal)\n\
This is an automated, non-interactive workflow step, not a user chat turn. \
No human can answer mid-step. Never pause to ask for approval or confirmation; \
Houston already handled approval at the workflow gate when required. \
Complete the task using your connected-app tools and local capabilities. \
Report concretely what you created, sent, or changed (names, links, ids). \
If Composio itself is not signed in, output exactly \
`<!--houston:workflow-connection {\"type\":\"composio_signin\"}-->`. \
If a required Composio app is not connected, output exactly \
`<!--houston:workflow-connection {\"type\":\"composio_toolkit\",\"toolkit\":\"<slug>\"}-->` \
using the required toolkit slug. Never describe a missing Composio connection in prose; \
emit the marker only. Emit one blocker only, with no question or normal error text. \
Houston will show the connection UI and retry this step after authorization.";

const APPROVED_GATE_INSTRUCTION: &str = "The user already approved this action in Houston. \
Do it now using your connected-app tools. Do not ask for approval again; \
report what you actually did.";

/// Assemble the user prompt for a workflow step dispatch turn.
pub fn build_step_prompt(
    workflow: &Workflow,
    plan_steps: &[WorkflowStep],
    run: &WorkflowRun,
    step: &WorkflowStep,
    approved: bool,
) -> String {
    let mut lines = vec![
        format!("Workflow: {}", workflow.name),
        format!("Goal: {}", workflow.plan_prompt),
        String::new(),
    ];

    if !step.depends_on.is_empty() {
        lines.push("Context from previous steps:".into());
        for dep_id in &step.depends_on {
            let dep_task = plan_steps
                .iter()
                .find(|s| s.id == *dep_id)
                .map(|s| s.task.as_str())
                .unwrap_or("(unknown step)");
            let summary = run
                .steps
                .iter()
                .find(|s| s.step_id == *dep_id)
                .and_then(|s| s.summary.as_deref())
                .unwrap_or("(no output yet)");
            lines.push(format!("- [{dep_id}] {dep_task}: {summary}"));
        }
        lines.push(String::new());
    }

    if step.requires_approval && approved {
        lines.push(APPROVED_GATE_INSTRUCTION.into());
        lines.push(String::new());
    }

    lines.push(format!("Task: {}", step.task));
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::types::{StepState, WorkflowPlan};

    fn sample_workflow() -> Workflow {
        Workflow {
            id: "wf-1".into(),
            name: "Competitors".into(),
            description: String::new(),
            plan_prompt: "Research competitors and draft deliverables".into(),
            plan: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn sample_run(research_summary: &str) -> WorkflowRun {
        WorkflowRun {
            id: "run-1".into(),
            workflow_id: "wf-1".into(),
            status: "running".into(),
            session_key: "workflow-wf-1-run-run-1".into(),
            plan: Some(WorkflowPlan {
                steps: vec![
                    WorkflowStep {
                        id: "research".into(),
                        task: "Research competitors".into(),
                        provider: None,
                        model: None,
                        effort: None,
                        use_worktree: false,
                        depends_on: vec![],
                        requires_approval: false,
                        toolkits: vec![],
                    },
                    WorkflowStep {
                        id: "write".into(),
                        task: "Create a Google Doc with the brief".into(),
                        provider: None,
                        model: None,
                        effort: None,
                        use_worktree: false,
                        depends_on: vec!["research".into()],
                        requires_approval: true,
                        toolkits: vec![],
                    },
                ],
            }),
            steps: vec![
                StepState {
                    step_id: "research".into(),
                    status: "done".into(),
                    approved: false,
                    summary: Some(research_summary.into()),
                    worktree_path: None,
                    blocker: None,
                },
                StepState {
                    step_id: "write".into(),
                    status: "pending".into(),
                    approved: true,
                    summary: None,
                    worktree_path: None,
                    blocker: None,
                },
            ],
            summary: None,
            started_at: String::new(),
            completed_at: None,
            plan_prompt: None,
            name: None,
            description: None,
            saved_workflow_id: None,
            source_chat_session_key: None,
        }
    }

    #[test]
    fn includes_upstream_summary_and_approval_instruction() {
        let workflow = sample_workflow();
        let run = sample_run("Brief: Acme and Beta are top rivals.");
        let write = run.plan.as_ref().unwrap().steps[1].clone();
        let prompt = build_step_prompt(
            &workflow,
            &run.plan.as_ref().unwrap().steps,
            &run,
            &write,
            true,
        );
        assert!(prompt.contains("Brief: Acme and Beta are top rivals."));
        assert!(prompt.contains("already approved this action"));
        assert!(prompt.contains("Create a Google Doc with the brief"));
    }

    #[test]
    fn omits_approval_instruction_when_not_approved() {
        let workflow = sample_workflow();
        let run = sample_run("Brief text.");
        let write = run.plan.as_ref().unwrap().steps[1].clone();
        let prompt = build_step_prompt(
            &workflow,
            &run.plan.as_ref().unwrap().steps,
            &run,
            &write,
            false,
        );
        assert!(!prompt.contains("already approved this action"));
    }
}
