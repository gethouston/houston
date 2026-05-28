//! CRUD operations for `.houston/activity/activity.json`.

use super::store::{read_json, write_json};
use super::types::{Activity, ActivityUpdate, NewActivity};
use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "activity";

pub fn list(root: &Path) -> CoreResult<Vec<Activity>> {
    read_json::<Vec<Activity>>(root, FILE)
}

pub fn create(root: &Path, input: NewActivity) -> CoreResult<Activity> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    // Every activity is bound to a session via the convention
    // `activity-{id}`. Storing this on the row lets
    // `sessions::start` and `set_status_by_session_key` find the row
    // without needing the caller to pass both IDs. Without this, any
    // attempt to flip status from the session lifecycle silently
    // no-ops — which is what left agents stuck on "needs_you" even
    // while a new session was actively streaming.
    let id = Uuid::new_v4().to_string();
    let session_key = format!("activity-{id}");
    let item = Activity {
        id,
        title: input.title,
        description: input.description,
        status: "running".to_string(),
        claude_session_id: None,
        session_key: Some(session_key),
        agent: input.agent,
        worktree_path: input.worktree_path,
        routine_id: None,
        routine_run_id: None,
        updated_at: Some(now),
        provider: input.provider,
        model: input.model,
    };
    items.push(item.clone());
    write_json(root, FILE, &items)?;
    Ok(item)
}

pub fn update(root: &Path, id: &str, updates: ActivityUpdate) -> CoreResult<Activity> {
    let mut items = list(root)?;
    let item = items
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("activity {id}")))?;

    if let Some(title) = updates.title {
        item.title = title;
    }
    if let Some(description) = updates.description {
        item.description = description;
    }
    if let Some(status) = updates.status {
        item.status = status;
    }
    if let Some(session_id) = updates.claude_session_id {
        item.claude_session_id = session_id;
    }
    if let Some(session_key) = updates.session_key {
        item.session_key = Some(session_key);
    }
    if let Some(agent) = updates.agent {
        item.agent = Some(agent);
    }
    if let Some(worktree_path) = updates.worktree_path {
        item.worktree_path = worktree_path;
    }
    if let Some(routine_id) = updates.routine_id {
        item.routine_id = Some(routine_id);
    }
    if let Some(routine_run_id) = updates.routine_run_id {
        item.routine_run_id = Some(routine_run_id);
    }
    if let Some(provider) = updates.provider {
        item.provider = Some(provider);
    }
    if let Some(model) = updates.model {
        item.model = Some(model);
    }

    item.updated_at = Some(Utc::now().to_rfc3339());

    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(result)
}

pub fn delete(root: &Path, id: &str) -> CoreResult<()> {
    let mut items = list(root)?;
    let before = items.len();
    items.retain(|t| t.id != id);
    if items.len() == before {
        return Err(CoreError::NotFound(format!("activity {id}")));
    }
    write_json(root, FILE, &items)
}

/// Set the status of the activity bound to `session_key`. Returns
/// `Ok(Some(activity))` if an activity was found and updated, `Ok(None)`
/// if no activity matches the session key (e.g. ad-hoc chat session
/// with no board item).
///
/// Matching order:
///   1. Exact match on the `session_key` field.
///   2. The "activity-{id}" convention — any older activity created
///      before `session_key` was persisted still has its id reachable
///      this way. Without this fallback, every legacy / onboarding row
///      would be stuck on whatever status it booted with forever.
///
/// Used by `sessions::start` so any client that kicks off a session —
/// desktop, mobile, or a third-party frontend — gets consistent
/// "Running" state on the board without each client having to write
/// the activity file themselves.
pub fn set_status_by_session_key(
    root: &Path,
    session_key: &str,
    status: &str,
) -> CoreResult<Option<Activity>> {
    let mut items = list(root)?;
    let implied_id = session_key.strip_prefix("activity-");
    let Some(item) = items.iter_mut().find(|t| {
        t.session_key.as_deref() == Some(session_key)
            || implied_id.is_some_and(|id| t.id == id)
    }) else {
        return Ok(None);
    };
    // Opportunistically heal legacy rows: if we matched via the id
    // convention but the session_key field was empty, backfill it so
    // future lookups hit the fast path.
    if item.session_key.as_deref() != Some(session_key) {
        item.session_key = Some(session_key.to_string());
    }
    if item.status == status {
        let result = item.clone();
        write_json(root, FILE, &items)?;
        return Ok(Some(result));
    }
    item.status = status.to_string();
    item.updated_at = Some(Utc::now().to_rfc3339());
    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(Some(result))
}

/// Recover a persisted activity row that still says `running` even though the
/// engine no longer owns a queued turn or provider process for it.
pub fn clear_stale_running_by_session_key(
    root: &Path,
    session_key: &str,
) -> CoreResult<Option<Activity>> {
    let mut items = list(root)?;
    let implied_id = session_key.strip_prefix("activity-");
    let Some(item) = items.iter_mut().find(|t| {
        t.session_key.as_deref() == Some(session_key) || implied_id.is_some_and(|id| t.id == id)
    }) else {
        return Ok(None);
    };

    if item.session_key.as_deref() != Some(session_key) {
        item.session_key = Some(session_key.to_string());
    }
    if item.status != "running" {
        return Ok(None);
    }

    item.status = "needs_you".to_string();
    item.updated_at = Some(Utc::now().to_rfc3339());
    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(Some(result))
}

/// On boot, no in-memory provider process or queued turn survives. Any
/// persisted activity row still marked `running` is an orphan from the previous
/// engine process and should become actionable again instead of spinning
/// forever in the UI.
pub fn sweep_orphan_running(root: &Path) -> CoreResult<usize> {
    let mut items = list(root)?;
    let mut repaired = 0usize;
    let now = Utc::now().to_rfc3339();

    for item in &mut items {
        if item.status == "running" {
            item.status = "needs_you".to_string();
            item.updated_at = Some(now.clone());
            repaired += 1;
        }
    }

    if repaired > 0 {
        write_json(root, FILE, &items)?;
    }

    Ok(repaired)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed_activity(root: &Path, session_key: Option<&str>, status: &str) -> Activity {
        let activity = create(
            root,
            NewActivity {
                title: "Test mission".into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .expect("create activity");
        let updates = ActivityUpdate {
            status: Some(status.to_string()),
            session_key: session_key.map(str::to_string),
            ..ActivityUpdate::default()
        };
        update(root, &activity.id, updates).expect("seed status")
    }

    #[test]
    fn flips_running_to_needs_you_when_queued_turn_cancelled() {
        // Repro of the "stuck on running" bug: the desktop UI optimistically
        // writes status=running on send, then the queued turn is cancelled
        // before run_start spawns the subprocess. set_status_by_session_key
        // must reset the row to a terminal status so the board doesn't show
        // a permanently-spinning mission.
        let dir = tempfile::TempDir::new().unwrap();
        let seeded = seed_activity(dir.path(), Some("chat-abc"), "running");

        let result = set_status_by_session_key(dir.path(), "chat-abc", "needs_you")
            .expect("status flip");

        let updated = result.expect("matching activity found");
        assert_eq!(updated.id, seeded.id);
        assert_eq!(updated.status, "needs_you");

        let persisted = list(dir.path()).unwrap();
        assert_eq!(persisted.len(), 1);
        assert_eq!(persisted[0].status, "needs_you");
    }

    #[test]
    fn flips_running_to_error_when_start_fails_early() {
        // Repro of the "stuck on running" bug on the early-failure path:
        // run_start returns Err before reaching its end-flip, the outer
        // wrapper must surface that as status=error on the activity row.
        let dir = tempfile::TempDir::new().unwrap();
        let seeded = seed_activity(dir.path(), Some("chat-xyz"), "running");

        let result =
            set_status_by_session_key(dir.path(), "chat-xyz", "error").expect("status flip");

        let updated = result.expect("matching activity found");
        assert_eq!(updated.id, seeded.id);
        assert_eq!(updated.status, "error");
    }

    #[test]
    fn matches_legacy_activity_id_when_session_key_missing() {
        // Legacy rows created before `session_key` was persisted are
        // addressable via the `activity-{id}` convention. The session
        // lifecycle relies on this fallback to flip those rows out of
        // their stale boot status.
        let dir = tempfile::TempDir::new().unwrap();
        let seeded = seed_activity(dir.path(), None, "running");
        let legacy_key = format!("activity-{}", seeded.id);

        let result = set_status_by_session_key(dir.path(), &legacy_key, "needs_you")
            .expect("status flip");

        let updated = result.expect("matching activity found via legacy id");
        assert_eq!(updated.status, "needs_you");
        // The fallback opportunistically backfills session_key so the next
        // lookup hits the fast path.
        assert_eq!(updated.session_key.as_deref(), Some(legacy_key.as_str()));
    }

    #[test]
    fn returns_none_for_ad_hoc_session_with_no_board_row() {
        // Ad-hoc sessions (no associated activity row) must not error —
        // the lifecycle code paths interpret Ok(None) as "no row to
        // flip" and continue.
        let dir = tempfile::TempDir::new().unwrap();
        seed_activity(dir.path(), Some("chat-other"), "running");

        let result = set_status_by_session_key(dir.path(), "chat-nonexistent", "error")
            .expect("call succeeds");

        assert!(result.is_none());
    }

    #[test]
    fn clears_only_running_activity_for_stale_cancel() {
        let dir = tempfile::TempDir::new().unwrap();
        let running = seed_activity(dir.path(), Some("chat-running"), "running");
        let done = seed_activity(dir.path(), Some("chat-done"), "done");

        let result = clear_stale_running_by_session_key(dir.path(), "chat-running")
            .expect("stale flip")
            .expect("running activity found");

        assert_eq!(result.id, running.id);
        assert_eq!(result.status, "needs_you");

        let done_result = clear_stale_running_by_session_key(dir.path(), "chat-done")
            .expect("non-running row should not error");
        assert!(done_result.is_none());

        let persisted = list(dir.path()).unwrap();
        assert_eq!(
            persisted
                .iter()
                .find(|item| item.id == done.id)
                .expect("done row")
                .status,
            "done"
        );
    }

    #[test]
    fn sweeps_orphan_running_rows_to_needs_you() {
        let dir = tempfile::TempDir::new().unwrap();
        let first = seed_activity(dir.path(), Some("chat-one"), "running");
        let second = seed_activity(dir.path(), Some("chat-two"), "needs_you");
        let third = seed_activity(dir.path(), Some("chat-three"), "running");

        let repaired = sweep_orphan_running(dir.path()).expect("sweep");

        assert_eq!(repaired, 2);
        let persisted = list(dir.path()).unwrap();
        let status = |id: &str| {
            persisted
                .iter()
                .find(|item| item.id == id)
                .expect("activity exists")
                .status
                .as_str()
        };
        assert_eq!(status(&first.id), "needs_you");
        assert_eq!(status(&second.id), "needs_you");
        assert_eq!(status(&third.id), "needs_you");
    }

    #[test]
    fn updates_timestamp_on_status_flip() {
        let dir = tempfile::TempDir::new().unwrap();
        let seeded = seed_activity(dir.path(), Some("chat-ts"), "running");
        let before = seeded.updated_at.clone().expect("seeded timestamp");

        // chrono RFC3339 has millisecond precision; nudge the clock so the
        // comparison is meaningful even on fast machines.
        std::thread::sleep(std::time::Duration::from_millis(5));

        let result = set_status_by_session_key(dir.path(), "chat-ts", "needs_you")
            .expect("status flip")
            .expect("matching activity");
        let after = result.updated_at.expect("post-flip timestamp");
        assert!(
            after > before,
            "updated_at should advance on status change: before={before} after={after}"
        );
    }
}
