//! Inline workflow runs — spec lives on the run, not in workflows.json.

use crate::error::{CoreError, CoreResult};
use crate::routines::runner::expand_tilde;
use crate::workflows::defs as workflow_defs;
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{BegunRun, InlineRunSpec, Workflow, WorkflowRun};
use houston_ui_events::DynEventSink;
use std::path::Path;

/// Resolve the workflow definition for a run: saved def wins, else reconstruct from inline fields.
pub(crate) fn effective_workflow(root: &Path, run: &WorkflowRun) -> CoreResult<Workflow> {
    match workflow_defs::find_by_id(root, &run.workflow_id) {
        Ok(w) => Ok(w),
        Err(CoreError::NotFound(_)) => match &run.plan_prompt {
            Some(pp) => Ok(Workflow {
                id: run.workflow_id.clone(),
                name: run.name.clone().unwrap_or_else(|| "Workflow".into()),
                description: run.description.clone().unwrap_or_default(),
                plan_prompt: pp.clone(),
                plan: None,
                created_at: run.started_at.clone(),
                updated_at: run.started_at.clone(),
            }),
            None => Err(CoreError::NotFound(format!("workflow {}", run.workflow_id))),
        },
        Err(e) => Err(e),
    }
}

pub fn begin_inline_run(
    events: &DynEventSink,
    agent_path: &str,
    spec: InlineRunSpec,
) -> CoreResult<BegunRun> {
    let working_dir = expand_tilde(Path::new(agent_path));
    let run = workflow_runs::create_inline(&working_dir, spec)?;
    let workflow = effective_workflow(&working_dir, &run)?;
    emit_runs_changed(events, agent_path);
    Ok(BegunRun {
        working_dir,
        workflow,
        run,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::defs::create as create_workflow;
    use crate::workflows::types::NewWorkflow;
    use tempfile::TempDir;

    fn sample_workflow() -> NewWorkflow {
        NewWorkflow {
            name: "Audit".into(),
            description: "Scan the repo".into(),
            plan_prompt: "Plan a scan".into(),
            plan: None,
        }
    }

    #[test]
    fn effective_workflow_prefers_saved_definition() {
        let d = TempDir::new().unwrap();
        let w = create_workflow(d.path(), sample_workflow()).unwrap();
        let run = workflow_runs::create(d.path(), &w.id).unwrap();
        let resolved = effective_workflow(d.path(), &run).unwrap();
        assert_eq!(resolved.id, w.id);
        assert_eq!(resolved.name, "Audit");
        assert_eq!(resolved.plan_prompt, "Plan a scan");
    }

    #[test]
    fn effective_workflow_reconstructs_from_inline_fields() {
        let d = TempDir::new().unwrap();
        let run = workflow_runs::create_inline(
            d.path(),
            InlineRunSpec {
                plan_prompt: "Do the thing".into(),
                name: Some("Chat task".into()),
                description: Some("From chat".into()),
            },
        )
        .unwrap();
        let resolved = effective_workflow(d.path(), &run).unwrap();
        assert!(run.workflow_id.starts_with("inline-"));
        assert_eq!(resolved.id, run.workflow_id);
        assert_eq!(resolved.name, "Chat task");
        assert_eq!(resolved.description, "From chat");
        assert_eq!(resolved.plan_prompt, "Do the thing");
    }

    #[test]
    fn effective_workflow_errors_without_saved_or_inline_spec() {
        let d = TempDir::new().unwrap();
        let run = workflow_runs::create(d.path(), "missing-workflow-id").unwrap();
        assert!(matches!(
            effective_workflow(d.path(), &run).unwrap_err(),
            CoreError::NotFound(_)
        ));
    }
}
