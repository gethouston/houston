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

/// Mark every `status="running"` row as `error` with a clear summary.
///
/// Engine call sites invoke this once per agent at scheduler-start time
/// because there's no way to distinguish a row from a still-alive
/// subprocess vs. one that's been orphaned by a previous engine crash
/// (the row is written before the dispatch awaits, and the dispatch
/// process is gone after a hard restart). Without this sweep, an orphan
/// would permanently block every future run of that routine via the
/// per-routine gate in [`create_if_routine_idle`].
///
/// Returns the number of rows reaped. Safe to call when there are no
/// orphan rows — it's a no-op.
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
        if run.status == "running" {
            run.status = "error".into();
            run.summary = Some("Engine restarted before this run finished".into());
            run.completed_at = Some(now.clone());
            run.paused_until = None;
            reaped += 1;
        }
    }
    if reaped > 0 {
        write_json(root, FILE, &runs)?;
    }
    Ok(reaped)
}

/// Create a run for `routine_id`, unless that *same* routine already has a
/// run in `running` status.
///
/// The gate is scoped to the routine, NOT the agent: two different routines
/// on the same agent that fire at the same time both get a run created, so
/// neither is silently dropped (issue #362). Serializing the actual sessions
/// — so two runs don't write the same folder at once — is the dispatcher's
/// job via the workdir lock, which now *waits* instead of failing.
///
/// Same-routine concurrency is still rejected so repeated `run-now` clicks
/// (or a cron fire that lands while the previous run is still in flight)
/// don't queue duplicate work or pollute history.
pub fn create_if_routine_idle(root: &Path, routine_id: &str) -> CoreResult<RoutineRun> {
    with_runs_lock(root, || {
        let existing = list(root)?;
        if let Some(busy) = existing
            .iter()
            .find(|r| r.routine_id == routine_id && r.status == "running")
        {
            return Err(CoreError::Conflict(format!(
                "routine {routine_id} already has a run in progress (run {})",
                busy.id
            )));
        }
        create_unlocked(root, routine_id)
    })
}

pub fn create(root: &Path, routine_id: &str) -> CoreResult<RoutineRun> {
    with_runs_lock(root, || create_unlocked(root, routine_id))
}

/// Derive a run's `session_key` from its routine's `chat_mode` (#423). Reads
/// the routine config to pick `Shared` (`routine-{id}`) vs. `PerRun`
/// (`routine-{id}-run-{run_id}`). A routine that can't be found falls back to
/// `Shared` — the #381 default — so a stray run never fails on key derivation.
fn session_key_for(root: &Path, routine_id: &str, run_id: &str) -> CoreResult<String> {
    let chat_mode = crate::routines::list(root)?
        .into_iter()
        .find(|r| r.id == routine_id)
        .map(|r| r.chat_mode)
        .unwrap_or_default();
    Ok(chat_mode.session_key(routine_id, run_id))
}

fn create_unlocked(root: &Path, routine_id: &str) -> CoreResult<RoutineRun> {
    ensure_houston_dir(root)?;
    let mut runs = list(root)?;
    let id = Uuid::new_v4().to_string();
    // The session key is the single lever for how a routine's runs map onto
    // chats: the activity surface + session history both find-or-create on it.
    // `Shared` (the #381 default) keeps a stable `routine-{id}` key so every run
    // streams into one conversation; `PerRun` (#423) makes it unique per run so
    // each surfaces in a fresh chat. Runs stay independent either way (the
    // dispatcher never resumes) — only the *view* changes.
    let session_key = session_key_for(root, routine_id, &id)?;
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
    with_runs_lock(root, || update_unlocked(root, id, updates))
}

fn update_unlocked(root: &Path, id: &str, updates: RoutineRunUpdate) -> CoreResult<RoutineRun> {
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

fn with_runs_lock<T>(root: &Path, f: impl FnOnce() -> CoreResult<T>) -> CoreResult<T> {
    crate::agents::store::with_json_file_lock(root, FILE, f)
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
    use std::fs;
    use std::thread;
    use tempfile::TempDir;

    fn write_raw_runs(root: &Path, body: &str) {
        let dir = root.join(".houston/routine_runs");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("routine_runs.json"), body).unwrap();
    }

    fn backups(root: &Path) -> Vec<std::path::PathBuf> {
        fs::read_dir(root.join(".houston/routine_runs"))
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
    fn create_then_update() {
        let d = TempDir::new().unwrap();
        let run = create(d.path(), "rid").unwrap();
        assert_eq!(run.routine_id, "rid");
        assert_eq!(run.status, "running");
        assert_eq!(run.session_key, "routine-rid");

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
    fn session_key_is_stable_per_routine() {
        // One chat per routine (#381): every run of a routine shares the same
        // session_key so their feeds aggregate into a single conversation,
        // while different routines keep their own chats.
        let d = TempDir::new().unwrap();
        let r1 = create(d.path(), "rid").unwrap();
        let r2 = create(d.path(), "rid").unwrap();
        assert_eq!(r1.session_key, "routine-rid");
        assert_eq!(r2.session_key, "routine-rid");
        assert_ne!(r1.id, r2.id, "runs are still distinct rows");

        let other = create(d.path(), "other").unwrap();
        assert_eq!(other.session_key, "routine-other");
    }

    #[test]
    fn session_key_follows_routine_chat_mode() {
        use crate::routines::types::{NewRoutine, RoutineChatMode};

        let d = TempDir::new().unwrap();

        // Shared routine → stable per-routine key, every run collapses to one.
        let shared = crate::routines::create(
            d.path(),
            NewRoutine {
                name: "Shared".into(),
                description: String::new(),
                prompt: "p".into(),
                schedule: "0 9 * * *".into(),
                enabled: true,
                suppress_when_silent: true,
                chat_mode: RoutineChatMode::Shared,
                timezone: None,
                integrations: vec![],
                provider: None,
                model: None,
            },
        )
        .unwrap();
        let r1 = create(d.path(), &shared.id).unwrap();
        let r2 = create(d.path(), &shared.id).unwrap();
        assert_eq!(r1.session_key, format!("routine-{}", shared.id));
        assert_eq!(r2.session_key, r1.session_key, "shared mode reuses one key");

        // Per-run routine → unique key per run, each run a fresh chat.
        let per_run = crate::routines::create(
            d.path(),
            NewRoutine {
                name: "PerRun".into(),
                description: String::new(),
                prompt: "p".into(),
                schedule: "0 9 * * *".into(),
                enabled: true,
                suppress_when_silent: true,
                chat_mode: RoutineChatMode::PerRun,
                timezone: None,
                integrations: vec![],
                provider: None,
                model: None,
            },
        )
        .unwrap();
        let p1 = create(d.path(), &per_run.id).unwrap();
        let p2 = create(d.path(), &per_run.id).unwrap();
        assert_eq!(p1.session_key, format!("routine-{}-run-{}", per_run.id, p1.id));
        assert_ne!(p1.session_key, p2.session_key, "per-run mode keys are unique");
    }

    #[test]
    fn list_repairs_trailing_json_and_preserves_backup() {
        let d = TempDir::new().unwrap();
        let valid = r#"[
          {
            "id": "run-1",
            "routine_id": "rid",
            "status": "silent",
            "session_key": "routine-rid-run-run-1",
            "started_at": "2026-05-18T22:00:00Z",
            "completed_at": "2026-05-18T22:01:00Z"
          }
        ]"#;
        let corrupt = format!("{valid}\n[]");
        write_raw_runs(d.path(), &corrupt);

        let runs = list(d.path()).unwrap();

        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, "run-1");
        let repaired =
            fs::read_to_string(d.path().join(".houston/routine_runs/routine_runs.json")).unwrap();
        assert!(serde_json::from_str::<Vec<RoutineRun>>(&repaired).is_ok());
        assert!(!repaired.trim_end().ends_with("[]"));

        let backups = backups(d.path());
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read_to_string(&backups[0]).unwrap(), corrupt);
    }

    #[test]
    fn list_resets_unsalvageable_run_history_after_backup() {
        let d = TempDir::new().unwrap();
        let corrupt = "[{\"id\":";
        write_raw_runs(d.path(), corrupt);

        let runs = list(d.path()).unwrap();

        assert!(runs.is_empty());
        let repaired =
            fs::read_to_string(d.path().join(".houston/routine_runs/routine_runs.json")).unwrap();
        assert_eq!(repaired.trim(), "[]");
        let backups = backups(d.path());
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read_to_string(&backups[0]).unwrap(), corrupt);
    }

    #[test]
    fn concurrent_create_preserves_each_run() {
        let d = TempDir::new().unwrap();
        let root = d.path().to_path_buf();
        let handles = (0..12)
            .map(|i| {
                let root = root.clone();
                thread::spawn(move || create(&root, &format!("rid-{i}")).unwrap())
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle.join().unwrap();
        }

        let runs = list(&root).unwrap();
        assert_eq!(runs.len(), 12);
    }

    #[test]
    fn create_if_routine_idle_serializes_same_routine() {
        // Spam-click protection: many concurrent attempts to run the SAME
        // routine collapse to a single in-flight run.
        let d = TempDir::new().unwrap();
        let root = d.path().to_path_buf();
        let handles = (0..8)
            .map(|_| {
                let root = root.clone();
                thread::spawn(move || create_if_routine_idle(&root, "same-rid"))
            })
            .collect::<Vec<_>>();

        let mut created = 0;
        let mut conflicts = 0;
        for handle in handles {
            match handle.join().unwrap() {
                Ok(_) => created += 1,
                Err(CoreError::Conflict(_)) => conflicts += 1,
                Err(err) => panic!("unexpected error: {err}"),
            }
        }

        assert_eq!(created, 1);
        assert_eq!(conflicts, 7);
        let runs = list(&root).unwrap();
        assert_eq!(runs.len(), 1);
    }

    #[test]
    fn create_if_routine_idle_allows_a_different_routine_while_one_runs() {
        // Issue #362: a second routine on the same agent must NOT be blocked
        // by an unrelated routine that happens to be running.
        let d = TempDir::new().unwrap();
        let root = d.path();

        let a = create_if_routine_idle(root, "routine-a").unwrap();
        assert_eq!(a.status, "running");

        // Different routine — allowed even though A is still running.
        let b = create_if_routine_idle(root, "routine-b").unwrap();
        assert_eq!(b.status, "running");

        // Same routine as the in-flight A — rejected.
        assert!(matches!(
            create_if_routine_idle(root, "routine-a").unwrap_err(),
            CoreError::Conflict(_)
        ));

        let runs = list(root).unwrap();
        assert_eq!(runs.len(), 2);
    }

    #[test]
    fn concurrent_create_if_routine_idle_allows_distinct_routines() {
        // Distinct routine ids racing concurrently each get their own run —
        // none are dropped.
        let d = TempDir::new().unwrap();
        let root = d.path().to_path_buf();
        let handles = (0..8)
            .map(|i| {
                let root = root.clone();
                thread::spawn(move || create_if_routine_idle(&root, &format!("rid-{i}")))
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle.join().unwrap().unwrap();
        }

        let runs = list(&root).unwrap();
        assert_eq!(runs.len(), 8);
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
    fn sweep_orphan_running_marks_only_running_rows() {
        let d = TempDir::new().unwrap();
        let orphan = create(d.path(), "rid").unwrap();
        let done = create(d.path(), "rid").unwrap();
        update(
            d.path(),
            &done.id,
            RoutineRunUpdate {
                status: Some("silent".into()),
                completed_at: Some(chrono::Utc::now().to_rfc3339()),
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
        assert_eq!(
            orphan_after.summary.as_deref(),
            Some("Engine restarted before this run finished")
        );
        assert!(orphan_after.completed_at.is_some());
        assert_eq!(done_after.status, "silent");
    }

    #[test]
    fn sweep_orphan_running_is_noop_when_clean() {
        let d = TempDir::new().unwrap();
        let done = create(d.path(), "rid").unwrap();
        update(
            d.path(),
            &done.id,
            RoutineRunUpdate {
                status: Some("silent".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(sweep_orphan_running(d.path()).unwrap(), 0);
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
