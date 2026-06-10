//! Promote a completed workflow run into a saved definition with a frozen plan.

use crate::error::{CoreError, CoreResult};
use crate::workflows::defs as workflow_defs;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::{NewWorkflow, Workflow, WorkflowRun};
use std::path::Path;

/// Create a saved workflow from a completed run that has a plan.
pub fn save_run_as_workflow(root: &Path, run_id: &str) -> CoreResult<Workflow> {
    let run = workflow_runs::find_by_id(root, run_id)?;
    if let Some(saved_id) = run.saved_workflow_id.as_deref() {
        return workflow_defs::find_by_id(root, saved_id);
    }
    if run.status != "done" {
        return Err(CoreError::Conflict(format!(
            "workflow run {run_id} cannot be saved (status={})",
            run.status
        )));
    }
    let plan = run
        .plan
        .as_ref()
        .ok_or_else(|| CoreError::BadRequest("workflow run has no plan to save".into()))?;
    crate::workflows::plan::validate_stored_plan(plan)?;

    let plan_prompt = resolve_plan_prompt(root, &run)?;
    let name = run
        .name
        .clone()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| "Workflow".into());
    let description = run.description.clone().unwrap_or_default();

    let saved = workflow_defs::create(
        root,
        NewWorkflow {
            name,
            description,
            plan_prompt,
            plan: run.plan.clone(),
        },
    )?;
    workflow_runs::update(
        root,
        run_id,
        crate::workflows::types::WorkflowRunUpdate {
            saved_workflow_id: Some(saved.id.clone()),
            ..Default::default()
        },
    )?;
    Ok(saved)
}

fn resolve_plan_prompt(root: &Path, run: &WorkflowRun) -> CoreResult<String> {
    if let Some(pp) = run.plan_prompt.as_ref() {
        if !pp.trim().is_empty() {
            return Ok(pp.clone());
        }
    }
    if let Ok(w) = workflow_defs::find_by_id(root, &run.workflow_id) {
        if !w.plan_prompt.trim().is_empty() {
            return Ok(w.plan_prompt);
        }
    }
    Err(CoreError::BadRequest(
        "workflow run has no plan_prompt to save".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::defs::create as create_workflow;
    use crate::workflows::plan::parse_plan;
    use crate::workflows::runs::{create_inline, update};
    use crate::workflows::types::{InlineRunSpec, WorkflowRunUpdate};
    use tempfile::TempDir;

    fn sample_plan() -> crate::workflows::types::WorkflowPlan {
        parse_plan(
            r#"{"steps":[{"id":"a","task":"Do step A","depends_on":[],"use_worktree":false}]}"#,
        )
        .unwrap()
    }

    #[test]
    fn save_run_as_workflow_from_inline_done_run() {
        let d = TempDir::new().unwrap();
        let run = create_inline(
            d.path(),
            InlineRunSpec {
                plan_prompt: "Plan and ship".into(),
                name: Some("Ship feature".into()),
                description: Some("From chat".into()),
            },
        )
        .unwrap();
        let plan = sample_plan();
        update(
            d.path(),
            &run.id,
            WorkflowRunUpdate {
                status: Some("done".into()),
                plan: Some(plan.clone()),
                ..Default::default()
            },
        )
        .unwrap();

        let saved = save_run_as_workflow(d.path(), &run.id).unwrap();
        assert_eq!(saved.name, "Ship feature");
        assert_eq!(saved.description, "From chat");
        assert_eq!(saved.plan_prompt, "Plan and ship");
        assert_eq!(saved.plan.as_ref(), Some(&plan));

        let updated = workflow_runs::find_by_id(d.path(), &run.id).unwrap();
        assert_eq!(
            updated.saved_workflow_id.as_deref(),
            Some(saved.id.as_str())
        );

        let again = save_run_as_workflow(d.path(), &run.id).unwrap();
        assert_eq!(again.id, saved.id);
    }

    #[test]
    fn save_run_rejects_non_done() {
        let d = TempDir::new().unwrap();
        let w = create_workflow(
            d.path(),
            crate::workflows::types::NewWorkflow {
                name: "W".into(),
                description: String::new(),
                plan_prompt: "Go".into(),
                plan: None,
            },
        )
        .unwrap();
        let run = workflow_runs::create(d.path(), &w.id).unwrap();
        assert!(matches!(
            save_run_as_workflow(d.path(), &run.id).unwrap_err(),
            CoreError::Conflict(_)
        ));
    }

    #[test]
    fn save_run_rejects_without_plan() {
        let d = TempDir::new().unwrap();
        let run = create_inline(
            d.path(),
            InlineRunSpec {
                plan_prompt: "Go".into(),
                name: None,
                description: None,
            },
        )
        .unwrap();
        update(
            d.path(),
            &run.id,
            WorkflowRunUpdate {
                status: Some("done".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(matches!(
            save_run_as_workflow(d.path(), &run.id).unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }
}
