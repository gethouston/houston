//! Routines — scheduled agent tasks that fire on cron and surface results.
//!
//! Relocated from `app/houston-tauri/src/agent_store/{routines,routine_runs}.rs`
//! and `app/src-tauri/src/routine_runner.rs`. Transport-neutral: REST routes
//! call these, so do tests and CLI tools.

pub mod cron_compat;
pub mod engine_dispatcher;
pub mod runner;
pub mod runs;
pub mod scheduler;
pub mod types;

use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

pub use types::{NewRoutine, Routine, RoutineChatMode, RoutineUpdate};

const FILE: &str = "routines";

// -- Typed JSON I/O helpers --

pub(crate) fn read_json<T: DeserializeOwned + Serialize + Default>(
    root: &Path,
    name: &str,
) -> CoreResult<T> {
    crate::agents::store::read_json(root, name)
}

pub(crate) fn write_json<T: Serialize>(root: &Path, name: &str, data: &T) -> CoreResult<()> {
    crate::agents::store::write_json(root, name, data)
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
        chat_mode: input.chat_mode,
        timezone: input.timezone,
        integrations: input.integrations,
        provider: input.provider,
        model: input.model,
        effort: input.effort,
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
    if let Some(chat_mode) = updates.chat_mode {
        routine.chat_mode = chat_mode;
    }
    if let Some(tz) = updates.timezone {
        routine.timezone = tz;
    }
    if let Some(integrations) = updates.integrations {
        routine.integrations = integrations;
    }
    if let Some(provider) = updates.provider {
        routine.provider = Some(provider);
    }
    if let Some(model) = updates.model {
        routine.model = Some(model);
    }
    if let Some(effort) = updates.effort {
        routine.effort = Some(effort);
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
            chat_mode: RoutineChatMode::Shared,
            timezone: None,
            integrations: vec![],
            provider: None,
            model: None,
            effort: None,
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
    fn chat_mode_defaults_to_shared_and_round_trips() {
        // New routines default to one shared chat (#381); the option flips to a
        // fresh chat per run (#423) and persists across read-back.
        let d = TempDir::new().unwrap();
        let r = create(d.path(), sample()).unwrap();
        assert_eq!(r.chat_mode, RoutineChatMode::Shared, "default is one shared chat");

        let upd = update(
            d.path(),
            &r.id,
            RoutineUpdate {
                chat_mode: Some(RoutineChatMode::PerRun),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(upd.chat_mode, RoutineChatMode::PerRun);
        // Re-read from disk to prove it serialized, not just mutated in memory.
        let reloaded = list(d.path()).unwrap();
        assert_eq!(reloaded[0].chat_mode, RoutineChatMode::PerRun);
    }

    #[test]
    fn chat_mode_absent_on_disk_reads_as_shared() {
        // A routine written before this option (no `chat_mode` key) must read
        // back as Shared so existing routines keep one chat with no migration.
        let d = TempDir::new().unwrap();
        let dir = d.path().join(".houston/routines");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("routines.json"),
            r#"[{
              "id": "legacy",
              "name": "Old",
              "description": "",
              "prompt": "p",
              "schedule": "0 9 * * *",
              "enabled": true,
              "suppress_when_silent": true,
              "integrations": [],
              "created_at": "2026-05-01T00:00:00Z",
              "updated_at": "2026-05-01T00:00:00Z"
            }]"#,
        )
        .unwrap();
        let loaded = list(d.path()).unwrap();
        assert_eq!(loaded[0].chat_mode, RoutineChatMode::Shared);
    }

    #[test]
    fn provider_model_round_trip_and_rebind() {
        // A routine pins a provider/model override that survives read-back, and
        // a later update can re-point it to a different provider/model.
        let d = TempDir::new().unwrap();
        let r = create(d.path(), sample()).unwrap();
        assert!(r.provider.is_none() && r.model.is_none(), "new routines inherit by default");

        let set = update(
            d.path(),
            &r.id,
            RoutineUpdate {
                provider: Some("openai".into()),
                model: Some("gpt-5.5".into()),
                effort: Some("high".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(set.provider.as_deref(), Some("openai"));
        assert_eq!(set.model.as_deref(), Some("gpt-5.5"));
        assert_eq!(set.effort.as_deref(), Some("high"));
        let reloaded = list(d.path()).unwrap();
        assert_eq!(reloaded[0].provider.as_deref(), Some("openai"), "serialized to disk");
        assert_eq!(reloaded[0].model.as_deref(), Some("gpt-5.5"));
        assert_eq!(reloaded[0].effort.as_deref(), Some("high"));

        let rebound = update(
            d.path(),
            &r.id,
            RoutineUpdate {
                provider: Some("anthropic".into()),
                model: Some("claude-opus-4-8".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(rebound.provider.as_deref(), Some("anthropic"));
        assert_eq!(rebound.model.as_deref(), Some("claude-opus-4-8"));
    }

    #[test]
    fn provider_model_unchanged_when_update_omits_them() {
        // `None` (omitted) must leave an existing override untouched.
        let d = TempDir::new().unwrap();
        let r = create(d.path(), sample()).unwrap();
        update(
            d.path(),
            &r.id,
            RoutineUpdate {
                provider: Some("anthropic".into()),
                model: Some("claude-opus-4-8".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let after = update(
            d.path(),
            &r.id,
            RoutineUpdate {
                name: Some("renamed".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(after.name, "renamed");
        assert_eq!(after.provider.as_deref(), Some("anthropic"), "override preserved");
        assert_eq!(after.model.as_deref(), Some("claude-opus-4-8"));
    }

    #[test]
    fn provider_model_absent_on_disk_reads_as_none() {
        // A routine written before this option (no provider/model keys) must
        // read back with no override so it inherits the agent's provider/model
        // at run time — no migration required.
        let d = TempDir::new().unwrap();
        let dir = d.path().join(".houston/routines");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("routines.json"),
            r#"[{
              "id": "legacy",
              "name": "Old",
              "description": "",
              "prompt": "p",
              "schedule": "0 9 * * *",
              "enabled": true,
              "suppress_when_silent": true,
              "integrations": [],
              "created_at": "2026-05-01T00:00:00Z",
              "updated_at": "2026-05-01T00:00:00Z"
            }]"#,
        )
        .unwrap();
        let loaded = list(d.path()).unwrap();
        assert!(loaded[0].provider.is_none());
        assert!(loaded[0].model.is_none());
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
