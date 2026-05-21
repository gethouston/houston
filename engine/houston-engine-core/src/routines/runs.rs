//! RoutineRun CRUD — per-routine history, auto-pruned to `MAX_RUNS_PER_ROUTINE`.

use crate::error::{CoreError, CoreResult};
use crate::routines::types::{RoutineRun, RoutineRunUpdate};
use crate::routines::{ensure_houston_dir, read_json, write_json};
use chrono::Utc;
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "routine_runs";
const MAX_RUNS_PER_ROUTINE: usize = 50;

pub fn list(root: &Path) -> CoreResult<Vec<RoutineRun>> {
    read_json::<Vec<RoutineRun>>(root, FILE)
}

pub fn list_for_routine(root: &Path, routine_id: &str) -> CoreResult<Vec<RoutineRun>> {
    let runs = list(root)?;
    Ok(runs
        .into_iter()
        .filter(|r| r.routine_id == routine_id)
        .collect())
}

pub fn find_by_id(root: &Path, id: &str) -> CoreResult<RoutineRun> {
    list(root)?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("routine run {id}")))
}

pub fn create(root: &Path, routine_id: &str) -> CoreResult<RoutineRun> {
    ensure_houston_dir(root)?;
    let mut runs = list(root)?;
    let id = Uuid::new_v4().to_string();
    let session_key = format!("routine-{routine_id}-run-{id}");
    let run = RoutineRun {
        id,
        routine_id: routine_id.to_string(),
        status: "running".into(),
        session_key,
        activity_id: None,
        summary: None,
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
        paused_until: None,
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
    if let Some(paused) = updates.paused_until {
        run.paused_until = paused;
    }

    let result = run.clone();
    write_json(root, FILE, &runs)?;
    Ok(result)
}

/// Keep at most `MAX_RUNS_PER_ROUTINE` runs per routine; drop oldest entries
/// (relies on the `runs` vector being append-ordered).
fn prune(runs: &mut Vec<RoutineRun>) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn empty_list() {
        let d = TempDir::new().unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn create_then_update() {
        let d = TempDir::new().unwrap();
        let run = create(d.path(), "rid").unwrap();
        assert_eq!(run.routine_id, "rid");
        assert_eq!(run.status, "running");
        assert!(run.session_key.contains("routine-rid-run-"));

        let done = update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                status: Some("silent".into()),
                summary: Some("nothing new".into()),
                completed_at: Some(chrono::Utc::now().to_rfc3339()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(done.status, "silent");
        assert!(done.completed_at.is_some());
    }

    #[test]
    fn list_for_routine_filters() {
        let d = TempDir::new().unwrap();
        create(d.path(), "a").unwrap();
        create(d.path(), "a").unwrap();
        create(d.path(), "b").unwrap();
        assert_eq!(list_for_routine(d.path(), "a").unwrap().len(), 2);
        assert_eq!(list_for_routine(d.path(), "b").unwrap().len(), 1);
        assert_eq!(list_for_routine(d.path(), "z").unwrap().len(), 0);
    }

    #[test]
    fn update_missing_errors() {
        let d = TempDir::new().unwrap();
        assert!(matches!(
            update(d.path(), "nope", RoutineRunUpdate::default()).unwrap_err(),
            CoreError::NotFound(_)
        ));
    }

    #[test]
    fn find_by_id_returns_run() {
        let d = TempDir::new().unwrap();
        let run = create(d.path(), "rid").unwrap();
        let found = find_by_id(d.path(), &run.id).unwrap();
        assert_eq!(found.id, run.id);
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
    fn paused_until_set_and_clear() {
        let d = TempDir::new().unwrap();
        let run = create(d.path(), "rid").unwrap();
        assert!(run.paused_until.is_none());

        // Set
        let after_set = update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                paused_until: Some(Some("5pm (America/Los_Angeles)".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            after_set.paused_until.as_deref(),
            Some("5pm (America/Los_Angeles)")
        );

        // Clear via Some(None)
        let after_clear = update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                paused_until: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(after_clear.paused_until.is_none());
    }

    #[test]
    fn paused_until_untouched_when_omitted() {
        // None (outer) on RoutineRunUpdate.paused_until must leave the
        // persisted value alone — the field is opt-in PATCH semantics.
        let d = TempDir::new().unwrap();
        let run = create(d.path(), "rid").unwrap();
        let _ = update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                paused_until: Some(Some("9am UTC".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let after = update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                summary: Some("noise".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(after.paused_until.as_deref(), Some("9am UTC"));
    }

    #[test]
    fn prune_limits_per_routine() {
        let d = TempDir::new().unwrap();
        for _ in 0..(MAX_RUNS_PER_ROUTINE + 5) {
            create(d.path(), "rid").unwrap();
        }
        let runs = list_for_routine(d.path(), "rid").unwrap();
        assert_eq!(runs.len(), MAX_RUNS_PER_ROUTINE);
    }
}
