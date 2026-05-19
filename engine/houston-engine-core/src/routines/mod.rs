//! Routines — scheduled agent tasks that fire on cron and surface results.
//!
//! Relocated from `app/houston-tauri/src/agent_store/{routines,routine_runs}.rs`
//! and `app/src-tauri/src/routine_runner.rs`. Transport-neutral: REST routes
//! call these, so do tests and CLI tools.

pub mod engine_dispatcher;
pub mod runner;
pub mod runs;
pub mod scheduler;
pub mod types;

use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use houston_agent_files as files;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

pub use types::{NewRoutine, Routine, RoutineUpdate};

const FILE: &str = "routines";

// -- Typed JSON I/O helpers (mirrors agent_store::helpers) --

fn rel_path(name: &str) -> String {
    format!(".houston/{name}/{name}.json")
}

pub(crate) fn read_json<T: DeserializeOwned + Default>(root: &Path, name: &str) -> CoreResult<T> {
    let rel = rel_path(name);
    let contents = files::read_file(root, &rel)
        .map_err(|e| CoreError::Internal(format!("read {rel}: {e}")))?;
    if contents.is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(&contents).map_err(Into::into)
}

pub(crate) fn write_json<T: Serialize>(root: &Path, name: &str, data: &T) -> CoreResult<()> {
    let rel = rel_path(name);
    let body = serde_json::to_string_pretty(data)?;
    files::write_file_atomic(root, &rel, &body)
        .map_err(|e| CoreError::Internal(format!("write {rel}: {e}")))
}

pub(crate) fn ensure_houston_dir(root: &Path) -> CoreResult<()> {
    let dir = root.join(".houston");
    std::fs::create_dir_all(&dir)?;
    Ok(())
}

// -- Routine CRUD --

pub fn list(root: &Path) -> CoreResult<Vec<Routine>> {
    read_json::<Vec<Routine>>(root, FILE)
}

pub fn create(root: &Path, input: NewRoutine) -> CoreResult<Routine> {
    ensure_houston_dir(root)?;
    let mut routines = list(root)?;
    let now = Utc::now().to_rfc3339();
    let routine = Routine {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        description: input.description,
        prompt: input.prompt,
        schedule: input.schedule,
        enabled: input.enabled,
        suppress_when_silent: input.suppress_when_silent,
        timezone: input.timezone,
        integrations: input.integrations,
        created_at: now.clone(),
        updated_at: now,
    };
    routines.push(routine.clone());
    write_json(root, FILE, &routines)?;
    Ok(routine)
}

pub fn update(root: &Path, id: &str, updates: RoutineUpdate) -> CoreResult<Routine> {
    let mut routines = list(root)?;
    let routine = routines
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("routine {id}")))?;

    if let Some(name) = updates.name {
        routine.name = name;
    }
    if let Some(description) = updates.description {
        routine.description = description;
    }
    if let Some(prompt) = updates.prompt {
        routine.prompt = prompt;
    }
    if let Some(schedule) = updates.schedule {
        routine.schedule = schedule;
    }
    if let Some(enabled) = updates.enabled {
        routine.enabled = enabled;
    }
    if let Some(suppress) = updates.suppress_when_silent {
        routine.suppress_when_silent = suppress;
    }
    if let Some(tz) = updates.timezone {
        routine.timezone = tz;
    }
    if let Some(integrations) = updates.integrations {
        routine.integrations = integrations;
    }
    routine.updated_at = Utc::now().to_rfc3339();

    let result = routine.clone();
    write_json(root, FILE, &routines)?;
    Ok(result)
}

pub fn delete(root: &Path, id: &str) -> CoreResult<()> {
    let mut routines = list(root)?;
    let before = routines.len();
    routines.retain(|r| r.id != id);
    if routines.len() == before {
        return Err(CoreError::NotFound(format!("routine {id}")));
    }
    write_json(root, FILE, &routines)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample() -> NewRoutine {
        NewRoutine {
            name: "Morning check".into(),
            description: "Every weekday at 9am".into(),
            prompt: "What's new?".into(),
            schedule: "0 9 * * 1-5".into(),
            enabled: true,
            suppress_when_silent: true,
            timezone: None,
            integrations: vec![],
        }
    }

    #[test]
    fn empty_listing() {
        let d = TempDir::new().unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn create_then_list() {
        let d = TempDir::new().unwrap();
        let r = create(d.path(), sample()).unwrap();
        assert_eq!(r.name, "Morning check");
        let all = list(d.path()).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, r.id);
    }

    #[test]
    fn update_fields_and_bumps_updated_at() {
        let d = TempDir::new().unwrap();
        let r = create(d.path(), sample()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let upd = update(
            d.path(),
            &r.id,
            RoutineUpdate {
                enabled: Some(false),
                schedule: Some("*/5 * * * *".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!upd.enabled);
        assert_eq!(upd.schedule, "*/5 * * * *");
        assert_ne!(upd.updated_at, r.updated_at);
    }

    #[test]
    fn update_missing_errors() {
        let d = TempDir::new().unwrap();
        let err = update(d.path(), "nope", RoutineUpdate::default()).unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }

    #[test]
    fn delete_missing_errors() {
        let d = TempDir::new().unwrap();
        let err = delete(d.path(), "nope").unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }

    #[test]
    fn delete_removes() {
        let d = TempDir::new().unwrap();
        let r = create(d.path(), sample()).unwrap();
        delete(d.path(), &r.id).unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }
}
