//! Workspace-root selection — view + change the user-visible, git-backed
//! Houston root (`docsRoot`).
//!
//! Changing the location does NOT move data inline — migrating a tree while the
//! engine is live (file watcher, scheduler, in-flight sessions all reading the
//! old root) would tear it. Instead `set_docs_root` validates + persists the
//! new absolute path and stages a `migrateFrom`; the next boot performs the
//! move BEFORE the engine starts and clears the flag. The caller prompts the
//! user to restart.

use std::path::PathBuf;

fn houston() -> PathBuf {
    houston_tauri::houston_db::db::houston_dir()
}

/// The workspace-root directory currently in effect — resolved from app-config,
/// defaulting to `~/.houston/workspaces` when the user has not chosen a root.
#[tauri::command(rename_all = "snake_case")]
pub fn get_docs_root() -> Result<String, String> {
    let h = houston();
    let cfg = crate::app_config::load(&h);
    Ok(crate::app_config::resolve_docs_dir(&h, &cfg)
        .to_string_lossy()
        .into_owned())
}

/// Validate + persist a new workspace root and stage a boot-time migration.
/// The new location takes effect on the next launch, so the caller must prompt
/// the user to restart Houston.
#[tauri::command(rename_all = "snake_case")]
pub fn set_docs_root(new_root: String) -> Result<(), String> {
    let trimmed = new_root.trim();
    if trimmed.is_empty() {
        return Err("Workspace location cannot be empty".into());
    }

    let h = houston();
    let mut cfg = crate::app_config::load(&h);
    let old = crate::app_config::resolve_docs_dir(&h, &cfg);

    // Resolve to a single absolute path NOW and persist that, so the engine's
    // resolver and the migrator never re-expand the string differently.
    let new = crate::app_config::expand_path(trimmed);
    if !new.is_absolute() {
        return Err("Workspace location must be an absolute path".into());
    }
    if new.is_file() {
        return Err("Workspace location must be a folder, not a file".into());
    }

    let new_abs = new.to_string_lossy().into_owned();

    // No change → persist the explicit (absolute) choice, clear any stale
    // migration, and stop.
    if crate::app_config::paths_equal(&new, &old) {
        cfg.docs_root = Some(new_abs);
        cfg.migrate_from = None;
        return crate::app_config::save(&h, &cfg).map_err(|e| e.to_string());
    }

    // A move between nested locations would move a tree into itself.
    if crate::app_config::paths_overlap(&new, &old) {
        return Err("New location cannot be inside the current one (or vice versa)".into());
    }

    cfg.docs_root = Some(new_abs);
    cfg.migrate_from = Some(old.to_string_lossy().into_owned());
    crate::app_config::save(&h, &cfg).map_err(|e| e.to_string())
}
