//! Workspace-root selection — view + change the user-visible, git-backed
//! Houston root (`docsRoot`).
//!
//! The chosen root is persisted in `~/.houston/app-config.json` and injected
//! as `HOUSTON_DOCS` at the next boot, so a change takes effect on the next
//! launch (the engine binds the root once at spawn). The caller prompts the
//! user to restart Houston after a successful change.

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

/// Persist a new workspace root and migrate any existing tree into it. The new
/// location takes effect on the next launch, so the caller must prompt the user
/// to restart Houston. Migration is idempotent + non-clobbering (see
/// `app_config::migrate_docs_root`).
#[tauri::command(rename_all = "snake_case")]
pub fn set_docs_root(new_root: String) -> Result<(), String> {
    let trimmed = new_root.trim();
    if trimmed.is_empty() {
        return Err("Workspace location cannot be empty".into());
    }
    let h = houston();
    let cfg = crate::app_config::load(&h);
    let old = crate::app_config::resolve_docs_dir(&h, &cfg);
    let new = houston_tauri::paths::expand_tilde(&PathBuf::from(trimmed));
    if new != old {
        crate::app_config::migrate_docs_root(&old, &new).map_err(|e| e.to_string())?;
    }
    crate::app_config::save(
        &h,
        &crate::app_config::AppConfig {
            docs_root: Some(trimmed.to_string()),
        },
    )
    .map_err(|e| e.to_string())
}
