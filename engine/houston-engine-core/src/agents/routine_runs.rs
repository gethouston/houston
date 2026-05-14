//! CRUD operations for `.houston/routine_runs/routine_runs.json`.
//!
//! Auto-prunes to keep at most `MAX_RUNS_PER_ROUTINE` runs per routine.

use super::routine_run_status::RoutineRunStatus;
use super::store::{read_json, write_json};
use super::types::{RoutineRun, RoutineRunUpdate};
use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "routine_runs";
const MAX_RUNS_PER_ROUTINE: usize = 50;

pub fn list(root: &Path) -> CoreResult<Vec<RoutineRun>> {
    read_json::<Vec<RoutineRun>>(root, FILE)
}

pub fn list_for_routine(root: &Path, routine_id: &str) -> CoreResult<Vec<RoutineRun>> {
    let runs = list(root)?;
    Ok(runs.into_iter().filter(|r| r.routine_id == routine_id).collect())
}

pub fn create(root: &Path, routine_id: &str) -> CoreResult<RoutineRun> {
    let mut runs = list(root)?;
    let id = Uuid::new_v4().to_string();
    let session_key = format!("routine-{routine_id}-run-{id}");
    let run = RoutineRun {
        id,
        routine_id: routine_id.to_string(),
        status: RoutineRunStatus::Running,
        session_key,
        activity_id: None,
        summary: None,
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
    };
    runs.push(run.clone());
    prune(&mut runs);
    write_json(root, FILE, &runs)?;
    Ok(run)
}

pub fn update(root: &Path, id: &str, updates: RoutineRunUpdate) -> CoreResult<RoutineRun> {
    let mut runs = list(root)?;
    let run = runs
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("routine run {id}")))?;

    if let Some(status) = updates.status {
        run.status = status;
    }
    if let Some(activity_id) = updates.activity_id {
        run.activity_id = Some(activity_id);
    }
    if let Some(summary) = updates.summary {
        run.summary = Some(summary);
    }
    if let Some(completed_at) = updates.completed_at {
        run.completed_at = Some(completed_at);
    }

    let result = run.clone();
    write_json(root, FILE, &runs)?;
    Ok(result)
}

/// Keep only the most recent `MAX_RUNS_PER_ROUTINE` runs per routine.
fn prune(runs: &mut Vec<RoutineRun>) {
    use std::collections::HashMap;

    let mut counts: HashMap<String, usize> = HashMap::new();
    for run in runs.iter() {
        *counts.entry(run.routine_id.clone()).or_default() += 1;
    }

    let over: HashMap<String, usize> = counts
        .into_iter()
        .filter(|(_, c)| *c > MAX_RUNS_PER_ROUTINE)
        .map(|(id, c)| (id, c - MAX_RUNS_PER_ROUTINE))
        .collect();

    if over.is_empty() {
        return;
    }

    let mut remaining = over;
    runs.retain(|r| {
        if let Some(to_remove) = remaining.get_mut(&r.routine_id) {
            if *to_remove > 0 {
                *to_remove -= 1;
                return false;
            }
        }
        true
    });
}
