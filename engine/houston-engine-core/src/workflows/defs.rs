//! Workflow definition CRUD — `.houston/workflows/workflows.json`.

use crate::error::{CoreError, CoreResult};
use crate::workflows::plan::validate_stored_plan;
use crate::workflows::types::{NewWorkflow, Workflow, WorkflowUpdate};
use crate::workflows::{ensure_houston_dir, read_json, write_json};
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "workflows";

pub fn list(root: &Path) -> CoreResult<Vec<Workflow>> {
    read_json::<Vec<Workflow>>(root, FILE)
}

pub fn find_by_id(root: &Path, id: &str) -> CoreResult<Workflow> {
    list(root)?
        .into_iter()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workflow {id}")))
}

pub fn create(root: &Path, input: NewWorkflow) -> CoreResult<Workflow> {
    ensure_houston_dir(root)?;
    let plan = match &input.plan {
        Some(p) => Some(validate_stored_plan(p)?),
        None => None,
    };
    let mut workflows = list(root)?;
    let now = Utc::now().to_rfc3339();
    let workflow = Workflow {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        description: input.description,
        plan_prompt: input.plan_prompt,
        plan,
        created_at: now.clone(),
        updated_at: now,
    };
    workflows.push(workflow.clone());
    write_json(root, FILE, &workflows)?;
    Ok(workflow)
}

pub fn update(root: &Path, id: &str, updates: WorkflowUpdate) -> CoreResult<Workflow> {
    let mut workflows = list(root)?;
    let workflow = workflows
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workflow {id}")))?;

    if let Some(name) = updates.name {
        workflow.name = name;
    }
    if let Some(description) = updates.description {
        workflow.description = description;
    }
    if let Some(plan_prompt) = updates.plan_prompt {
        workflow.plan_prompt = plan_prompt;
    }
    if let Some(plan) = updates.plan {
        workflow.plan = Some(validate_stored_plan(&plan)?);
    }
    workflow.updated_at = Utc::now().to_rfc3339();

    let result = workflow.clone();
    write_json(root, FILE, &workflows)?;
    Ok(result)
}

pub fn delete(root: &Path, id: &str) -> CoreResult<()> {
    let mut workflows = list(root)?;
    let before = workflows.len();
    workflows.retain(|w| w.id != id);
    if workflows.len() == before {
        return Err(CoreError::NotFound(format!("workflow {id}")));
    }
    write_json(root, FILE, &workflows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample() -> NewWorkflow {
        NewWorkflow {
            name: "Security audit".into(),
            description: "Scan the repo".into(),
            plan_prompt: "Break this into parallel folder scans".into(),
            plan: None,
        }
    }

    #[test]
    fn empty_list() {
        let d = TempDir::new().unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn create_list_find_update_delete() {
        let d = TempDir::new().unwrap();
        let w = create(d.path(), sample()).unwrap();
        assert_eq!(w.name, "Security audit");

        let found = find_by_id(d.path(), &w.id).unwrap();
        assert_eq!(found.id, w.id);

        let upd = update(
            d.path(),
            &w.id,
            WorkflowUpdate {
                name: Some("Renamed".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(upd.name, "Renamed");
        assert_ne!(upd.updated_at, w.updated_at);

        delete(d.path(), &w.id).unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn find_missing_errors() {
        let d = TempDir::new().unwrap();
        assert!(matches!(
            find_by_id(d.path(), "nope").unwrap_err(),
            CoreError::NotFound(_)
        ));
    }

    #[test]
    fn update_missing_errors() {
        let d = TempDir::new().unwrap();
        assert!(matches!(
            update(d.path(), "nope", WorkflowUpdate::default()).unwrap_err(),
            CoreError::NotFound(_)
        ));
    }

    #[test]
    fn delete_missing_errors() {
        let d = TempDir::new().unwrap();
        assert!(matches!(
            delete(d.path(), "nope").unwrap_err(),
            CoreError::NotFound(_)
        ));
    }

    #[test]
    fn deserialize_legacy_workflow_without_plan_field() {
        let d = TempDir::new().unwrap();
        let w = create(d.path(), sample()).unwrap();
        let raw = std::fs::read_to_string(d.path().join(".houston/workflows/workflows.json")).unwrap();
        assert!(!raw.contains("\"plan\""));
        let found = find_by_id(d.path(), &w.id).unwrap();
        assert!(found.plan.is_none());
    }

    #[test]
    fn create_with_frozen_plan() {
        use crate::workflows::plan::parse_plan;

        let d = TempDir::new().unwrap();
        let plan = parse_plan(
            r#"{"steps":[{"id":"s1","task":"Step one","depends_on":[],"use_worktree":false}]}"#,
        )
        .unwrap();
        let w = create(
            d.path(),
            NewWorkflow {
                name: "Frozen".into(),
                description: String::new(),
                plan_prompt: "Do things".into(),
                plan: Some(plan.clone()),
            },
        )
        .unwrap();
        assert_eq!(w.plan.as_ref(), Some(&plan));
    }
}
