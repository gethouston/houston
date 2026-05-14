//! CRUD operations for `.houston/activity/activity.json`.
//!
//! Lifecycle-y transitions (status + lease updates driven by the session
//! runner / reaper) live in [`super::lifecycle`] so this file stays a
//! pure CRUD surface.

use super::status::ActivityStatus;
use super::store::{file_path, read_json, write_json};
use super::types::{Activity, ActivityUpdate, NewActivity};
use crate::error::{CoreError, CoreResult};
use crate::file_mutex::with_file_lock;
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "activity";

pub fn list(root: &Path) -> CoreResult<Vec<Activity>> {
    read_json::<Vec<Activity>>(root, FILE)
}

pub fn create(root: &Path, input: NewActivity) -> CoreResult<Activity> {
    with_file_lock(&file_path(root, FILE), || create_locked(root, input))
}

fn create_locked(root: &Path, input: NewActivity) -> CoreResult<Activity> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    // Every activity is bound to a session via the convention
    // `activity-{id}`. Storing this on the row lets `sessions::start`
    // and the lifecycle helpers find the row without needing the caller
    // to pass both IDs. Without this, any attempt to flip status from
    // the session lifecycle silently no-ops — which is what left agents
    // stuck on "needs_you" even while a new session was actively streaming.
    let id = Uuid::new_v4().to_string();
    let session_key = format!("activity-{id}");
    let item = Activity {
        id,
        title: input.title,
        description: input.description,
        // Start in `Queued`, NOT `Running`. The CLI hasn't been spawned
        // yet and no lease exists in the engine-owned lease store — if
        // we said `Running` here the reaper would (correctly) see a
        // leaseless `running` row and flip it to `Interrupted` before
        // `sessions::start` had a chance to attach a lease. `Queued`
        // is the row's honest state until the session task takes
        // ownership via `lifecycle::attach_lease`.
        status: ActivityStatus::Queued,
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
    with_file_lock(&file_path(root, FILE), || update_locked(root, id, updates))
}

fn update_locked(root: &Path, id: &str, updates: ActivityUpdate) -> CoreResult<Activity> {
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
    with_file_lock(&file_path(root, FILE), || {
        let mut items = list(root)?;
        let before = items.len();
        items.retain(|t| t.id != id);
        if items.len() == before {
            return Err(CoreError::NotFound(format!("activity {id}")));
        }
        write_json(root, FILE, &items)?;
        Ok(())
    })
}

