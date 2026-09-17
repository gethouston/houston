//! OS-native file dialogs for the portable agent share / import flow.
//!
//! The one operation the engine cannot do remotely: pick a `.houstonagent`
//! file on disk and read its bytes (import).
//!
//! The platform dialogs themselves live in `super::dialogs` (shared with the
//! Files-tab download command in `save_file.rs`).

use super::dialogs::open_dialog;

const WIN_FILTER: &str = "Houston AI Employee (*.houstonagent)|*.houstonagent|All files (*.*)|*.*";

/// Show an open dialog and return the bytes of the chosen file. Returns
/// `None` if the user cancelled.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_portable_agent() -> Result<Option<Vec<u8>>, String> {
    let Some(path) = open_dialog("Pick an AI Employee file from a friend", Some(WIN_FILTER)).await?
    else {
        return Ok(None);
    };
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read selected file: {e}"))?;
    Ok(Some(bytes))
}
