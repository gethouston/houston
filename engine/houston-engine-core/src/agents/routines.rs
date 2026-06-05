//! CRUD operations for `.houston/routines/routines.json`.

use super::store::{read_json, write_json};
use super::types::{NewRoutine, Routine, RoutineUpdate};
use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "routines";

pub fn list(root: &Path) -> CoreResult<Vec<Routine>> {
    read_json::<Vec<Routine>>(root, FILE)
}

pub fn create(root: &Path, input: NewRoutine) -> CoreResult<Routine> {
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
    if let Some(chat_mode) = updates.chat_mode {
        routine.chat_mode = chat_mode;
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
