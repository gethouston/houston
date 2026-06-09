//! WorkflowRun CRUD — per-workflow history, auto-pruned.

use crate::error::{CoreError, CoreResult};
use crate::workflows::types::{
    InlineRunSpec, StepState, WorkflowPlan, WorkflowRun, WorkflowRunUpdate,
};
use crate::workflows::{ensure_houston_dir, read_json, write_json};
use chrono::Utc;
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "workflow_runs";
const MAX_RUNS_PER_WORKFLOW: usize = 50;

/// Non-terminal statuses reaped by [`sweep_orphan_running`] after an engine restart.
const ORPHAN_STATUSES: &[&str] = &["planning", "awaiting_approval", "running"];

pub fn list(root: &Path) -> CoreResult<Vec<WorkflowRun>> {
    read_json::<Vec<WorkflowRun>>(root, FILE)
}

pub fn list_for_workflow(root: &Path, workflow_id: &str) -> CoreResult<Vec<WorkflowRun>> {
    Ok(list(root)?
        .into_iter()
        .filter(|r| r.workflow_id == workflow_id)
        .collect())
}

pub fn find_by_id(root: &Path, id: &str) -> CoreResult<WorkflowRun> {
    list(root)?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workflow run {id}")))
}

pub fn sweep_orphan_running(root: &Path) -> CoreResult<usize> {
    with_runs_lock(root, || sweep_orphan_running_unlocked(root))
}

fn sweep_orphan_running_unlocked(root: &Path) -> CoreResult<usize> {
    let mut runs = list(root)?;
    if runs.is_empty() {
        return Ok(0);
    }
    let now = Utc::now().to_rfc3339();
    let mut reaped = 0;
    for run in runs.iter_mut() {
        if ORPHAN_STATUSES.contains(&run.status.as_str()) {
            run.status = "error".into();
            run.summary = Some("Engine restarted before this run finished".into());
            run.completed_at = Some(now.clone());
            reaped += 1;
        }
    }
    if reaped > 0 {
        write_json(root, FILE, &runs)?;
    }
    Ok(reaped)
}

pub fn create(root: &Path, workflow_id: &str) -> CoreResult<WorkflowRun> {
    with_runs_lock(root, || create_unlocked(root, workflow_id))
}

pub fn create_inline(root: &Path, spec: InlineRunSpec) -> CoreResult<WorkflowRun> {
    if spec.plan_prompt.trim().is_empty() {
        return Err(CoreError::BadRequest(
            "inline workflow run plan_prompt must not be empty".into(),
        ));
    }
    with_runs_lock(root, || create_inline_unlocked(root, spec))
}

fn create_unlocked(root: &Path, workflow_id: &str) -> CoreResult<WorkflowRun> {
    persist_new_run(root, new_run_row(workflow_id, None))
}

fn create_inline_unlocked(root: &Path, spec: InlineRunSpec) -> CoreResult<WorkflowRun> {
    let workflow_id = format!("inline-{}", Uuid::new_v4());
    persist_new_run(root, new_run_row(&workflow_id, Some(&spec)))
}

fn new_run_row(workflow_id: &str, inline: Option<&InlineRunSpec>) -> WorkflowRun {
    let id = Uuid::new_v4().to_string();
    let session_key = format!("workflow-{workflow_id}-run-{id}");
    let (plan_prompt, name, description) = match inline {
        Some(spec) => (
            Some(spec.plan_prompt.clone()),
            spec.name.clone(),
            spec.description.clone(),
        ),
        None => (None, None, None),
    };
    WorkflowRun {
        id,
        workflow_id: workflow_id.to_string(),
        status: "planning".into(),
        session_key,
        plan: None,
        steps: Vec::new(),
        summary: None,
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
        plan_prompt,
        name,
        description,
        saved_workflow_id: None,
    }
}

fn persist_new_run(root: &Path, run: WorkflowRun) -> CoreResult<WorkflowRun> {
    ensure_houston_dir(root)?;
    let mut runs = list(root)?;
    let result = run.clone();
    runs.push(run);
    prune(&mut runs);
    write_json(root, FILE, &runs)?;
    Ok(result)
}

pub fn update(root: &Path, id: &str, updates: WorkflowRunUpdate) -> CoreResult<WorkflowRun> {
    with_runs_lock(root, || update_unlocked(root, id, updates))
}

fn update_unlocked(root: &Path, id: &str, updates: WorkflowRunUpdate) -> CoreResult<WorkflowRun> {
    let mut runs = list(root)?;
    let run = runs
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workflow run {id}")))?;

    if let Some(status) = updates.status {
        run.status = status;
    }
    if let Some(plan) = updates.plan {
        if run.steps.is_empty() {
            run.steps = step_states_from_plan(&plan);
        }
        run.plan = Some(plan);
    }
    if let Some(steps) = updates.steps {
        run.steps = steps;
    }
    if let Some(summary) = updates.summary {
        run.summary = Some(summary);
    }
    if let Some(completed_at) = updates.completed_at {
        run.completed_at = Some(completed_at);
    }
    if let Some(saved_workflow_id) = updates.saved_workflow_id {
        run.saved_workflow_id = Some(saved_workflow_id);
    }

    let result = run.clone();
    write_json(root, FILE, &runs)?;
    Ok(result)
}

/// Patch one step row on a run (used by the executor for live progress).
pub fn patch_step(
    root: &Path,
    run_id: &str,
    step_id: &str,
    mut patch: impl FnMut(&mut StepState),
) -> CoreResult<WorkflowRun> {
    with_runs_lock(root, || {
        let mut runs = list(root)?;
        let run = runs
            .iter_mut()
            .find(|r| r.id == run_id)
            .ok_or_else(|| CoreError::NotFound(format!("workflow run {run_id}")))?;
        let step = run
            .steps
            .iter_mut()
            .find(|s| s.step_id == step_id)
            .ok_or_else(|| CoreError::NotFound(format!("workflow step {step_id}")))?;
        patch(step);
        let result = run.clone();
        write_json(root, FILE, &runs)?;
        Ok(result)
    })
}

/// Build pending step rows when a plan is first attached to a run.
pub fn step_states_from_plan(plan: &WorkflowPlan) -> Vec<StepState> {
    plan.steps
        .iter()
        .map(|s| StepState {
            step_id: s.id.clone(),
            status: "pending".into(),
            approved: false,
            summary: None,
            worktree_path: None,
        })
        .collect()
}

fn with_runs_lock<T>(root: &Path, f: impl FnOnce() -> CoreResult<T>) -> CoreResult<T> {
    crate::agents::store::with_json_file_lock(root, FILE, f)
}

fn prune(runs: &mut Vec<WorkflowRun>) {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for run in runs.iter() {
        *counts.entry(run.workflow_id.clone()).or_default() += 1;
    }
    let over: HashMap<String, usize> = counts
        .into_iter()
        .filter(|(_, c)| *c > MAX_RUNS_PER_WORKFLOW)
        .map(|(id, c)| (id, c - MAX_RUNS_PER_WORKFLOW))
        .collect();
    if over.is_empty() {
        return;
    }
    let mut remaining = over;
    runs.retain(|r| {
        if let Some(to_remove) = remaining.get_mut(&r.workflow_id) {
            if *to_remove > 0 {
                *to_remove -= 1;
                return false;
            }
        }
        true
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::plan::parse_plan;
    use std::fs;
    use std::thread;
    use tempfile::TempDir;

    fn write_raw_runs(root: &Path, body: &str) {
        let dir = root.join(".houston/workflow_runs");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("workflow_runs.json"), body).unwrap();
    }

    fn backups(root: &Path) -> Vec<std::path::PathBuf> {
        fs::read_dir(root.join(".houston/workflow_runs"))
            .unwrap()
            .filter_map(|entry| {
                let path = entry.unwrap().path();
                let name = path.file_name()?.to_str()?;
                name.contains(".corrupt-").then_some(path)
            })
            .collect()
    }

    #[test]
    fn empty_list() {
        let d = TempDir::new().unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn create_then_update_terminal() {
        let d = TempDir::new().unwrap();
        let run = create(d.path(), "wid").unwrap();
        assert_eq!(run.status, "planning");
        assert_eq!(run.session_key, format!("workflow-wid-run-{}", run.id));

        let plan = parse_plan(
            r#"{"steps":[{"id":"a","task":"scan"}]}"#,
        )
        .unwrap();
        let mid = update(
            d.path(),
            &run.id,
            WorkflowRunUpdate {
                status: Some("awaiting_approval".into()),
                plan: Some(plan),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(mid.status, "awaiting_approval");
        assert_eq!(mid.steps.len(), 1);
        assert_eq!(mid.steps[0].status, "pending");

        let done = update(
            d.path(),
            &run.id,
            WorkflowRunUpdate {
                status: Some("done".into()),
                completed_at: Some(Utc::now().to_rfc3339()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(done.status, "done");
        assert!(done.completed_at.is_some());
    }

    #[test]
    fn create_inline_sets_fields_and_synthetic_id() {
        let d = TempDir::new().unwrap();
        let run = create_inline(
            d.path(),
            InlineRunSpec {
                plan_prompt: "Plan from chat".into(),
                name: Some("My task".into()),
                description: Some("desc".into()),
            },
        )
        .unwrap();
        assert!(run.workflow_id.starts_with("inline-"));
        assert_eq!(run.status, "planning");
        assert_eq!(run.plan_prompt.as_deref(), Some("Plan from chat"));
        assert_eq!(run.name.as_deref(), Some("My task"));
        assert_eq!(run.description.as_deref(), Some("desc"));
        assert_eq!(
            run.session_key,
            format!("workflow-{}-run-{}", run.workflow_id, run.id)
        );
    }

    #[test]
    fn create_inline_rejects_empty_plan_prompt() {
        let d = TempDir::new().unwrap();
        assert!(matches!(
            create_inline(
                d.path(),
                InlineRunSpec {
                    plan_prompt: "  ".into(),
                    name: None,
                    description: None,
                },
            )
            .unwrap_err(),
            CoreError::BadRequest(_)
        ));
    }

    #[test]
    fn find_by_id_missing_errors() {
        let d = TempDir::new().unwrap();
        assert!(matches!(
            find_by_id(d.path(), "nope").unwrap_err(),
            CoreError::NotFound(_)
        ));
    }

    #[test]
    fn list_for_workflow_filters() {
        let d = TempDir::new().unwrap();
        create(d.path(), "a").unwrap();
        create(d.path(), "a").unwrap();
        create(d.path(), "b").unwrap();
        assert_eq!(list_for_workflow(d.path(), "a").unwrap().len(), 2);
        assert_eq!(list_for_workflow(d.path(), "b").unwrap().len(), 1);
    }

    #[test]
    fn prune_limits_per_workflow() {
        let d = TempDir::new().unwrap();
        for _ in 0..(MAX_RUNS_PER_WORKFLOW + 5) {
            create(d.path(), "wid").unwrap();
        }
        assert_eq!(
            list_for_workflow(d.path(), "wid").unwrap().len(),
            MAX_RUNS_PER_WORKFLOW
        );
    }

    #[test]
    fn sweep_orphan_running_reaps_only_non_terminal() {
        let d = TempDir::new().unwrap();
        let orphan = create(d.path(), "wid").unwrap();
        let done = create(d.path(), "wid").unwrap();
        update(
            d.path(),
            &done.id,
            WorkflowRunUpdate {
                status: Some("done".into()),
                completed_at: Some(Utc::now().to_rfc3339()),
                ..Default::default()
            },
        )
        .unwrap();

        let reaped = sweep_orphan_running(d.path()).unwrap();
        assert_eq!(reaped, 1);

        let runs = list(d.path()).unwrap();
        let orphan_after = runs.iter().find(|r| r.id == orphan.id).unwrap();
        let done_after = runs.iter().find(|r| r.id == done.id).unwrap();
        assert_eq!(orphan_after.status, "error");
        assert_eq!(done_after.status, "done");
    }

    #[test]
    fn sweep_orphan_running_noop_when_clean() {
        let d = TempDir::new().unwrap();
        let done = create(d.path(), "wid").unwrap();
        update(
            d.path(),
            &done.id,
            WorkflowRunUpdate {
                status: Some("done".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(sweep_orphan_running(d.path()).unwrap(), 0);
    }

    #[test]
    fn list_repairs_trailing_json_and_preserves_backup() {
        let d = TempDir::new().unwrap();
        let valid = r#"[
          {
            "id": "run-1",
            "workflow_id": "wid",
            "status": "done",
            "session_key": "workflow-wid-run-run-1",
            "steps": [],
            "started_at": "2026-05-18T22:00:00Z",
            "completed_at": "2026-05-18T22:01:00Z"
          }
        ]"#;
        let corrupt = format!("{valid}\n[]");
        write_raw_runs(d.path(), &corrupt);

        let runs = list(d.path()).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, "run-1");

        let repaired = fs::read_to_string(
            d.path().join(".houston/workflow_runs/workflow_runs.json"),
        )
        .unwrap();
        assert!(serde_json::from_str::<Vec<WorkflowRun>>(&repaired).is_ok());
        assert_eq!(backups(d.path()).len(), 1);
    }

    #[test]
    fn list_resets_unsalvageable_run_history_after_backup() {
        let d = TempDir::new().unwrap();
        let corrupt = "[{\"id\":";
        write_raw_runs(d.path(), corrupt);

        let runs = list(d.path()).unwrap();
        assert!(runs.is_empty());
        let repaired = fs::read_to_string(
            d.path().join(".houston/workflow_runs/workflow_runs.json"),
        )
        .unwrap();
        assert_eq!(repaired.trim(), "[]");
        assert_eq!(backups(d.path()).len(), 1);
    }

    #[test]
    fn concurrent_create_preserves_each_run() {
        let d = TempDir::new().unwrap();
        let root = d.path().to_path_buf();
        let handles = (0..12)
            .map(|i| {
                let root = root.clone();
                thread::spawn(move || create(&root, &format!("wid-{i}")).unwrap())
            })
            .collect::<Vec<_>>();
        for handle in handles {
            handle.join().unwrap();
        }
        assert_eq!(list(&root).unwrap().len(), 12);
    }
}
