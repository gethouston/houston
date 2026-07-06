//! OS-native file dialogs for the portable agent share / import flow.
//!
//! Two operations the engine cannot do remotely:
//!   * Pick a save destination and write zip bytes to it (export).
//!   * Pick a `.houstonagent` file on disk and read its bytes (import).
//!
//! The platform dialogs themselves live in `super::dialogs` (shared with the
//! Files-tab download command in `save_file.rs`).

use std::path::PathBuf;

use super::dialogs::{open_dialog, save_dialog};

const WIN_FILTER: &str = "Houston Agent (*.houstonagent)|*.houstonagent|All files (*.*)|*.*";

/// Show a save dialog and write the provided bytes to the chosen path.
/// Returns the path the user picked, or `None` if cancelled.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_portable_agent(
    default_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let Some(path) = save_dialog("Save shared agent", &default_name, Some(WIN_FILTER)).await?
    else {
        return Ok(None);
    };
    let target = PathBuf::from(&path);
    tokio::fs::write(&target, bytes)
        .await
        .map_err(|e| format!("Failed to save file: {e}"))?;
    Ok(Some(path))
}

/// Show an open dialog and return the bytes of the chosen file. Returns
/// `None` if the user cancelled.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_portable_agent() -> Result<Option<Vec<u8>>, String> {
    let Some(path) = open_dialog("Pick an agent file from a friend", Some(WIN_FILTER)).await?
    else {
        return Ok(None);
    };
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read selected file: {e}"))?;
    Ok(Some(bytes))
}
