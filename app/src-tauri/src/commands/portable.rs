//! OS-native file dialogs for the portable agent share / import flow.
//!
//! Two operations the engine cannot do remotely:
//!   * Pick a save destination and write zip bytes to it (export).
//!   * Pick a `.houstonagent` file on disk and read its bytes (import).
//!
//! Both shell out to OS-native dialogs (osascript on macOS, PowerShell on
//! Windows) so we don't pull in a Tauri dialog plugin just for two
//! operations. Mirrors the existing `pick_directory` pattern in `os.rs`.

use std::path::PathBuf;
use tokio::process::Command;

#[cfg(target_os = "macos")]
async fn save_dialog(default_name: &str) -> Result<Option<String>, String> {
    let script = format!(
        r#"POSIX path of (choose file name with prompt "Save shared agent" default name "{default_name}")"#
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .await
        .map_err(|e| format!("Failed to open save dialog: {e}"))?;
    if !output.status.success() {
        // User cancelled — osascript returns non-zero. Treat as None.
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[cfg(target_os = "windows")]
async fn save_dialog(default_name: &str) -> Result<Option<String>, String> {
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dlg = New-Object System.Windows.Forms.SaveFileDialog
$dlg.FileName = "{default_name}"
$dlg.Filter = "Houston Agent (*.houstonagent)|*.houstonagent"
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dlg.FileName
}}
"#
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to open save dialog: {e}"))?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[cfg(target_os = "macos")]
async fn open_dialog() -> Result<Option<String>, String> {
    // `choose file` always returns a POSIX path. The user can pick any
    // extension; we validate the bytes parse server-side.
    let script = r#"POSIX path of (choose file with prompt "Pick an agent file from a friend")"#;
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .await
        .map_err(|e| format!("Failed to open file dialog: {e}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[cfg(target_os = "windows")]
async fn open_dialog() -> Result<Option<String>, String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Filter = "Houston Agent (*.houstonagent)|*.houstonagent|All files (*.*)|*.*"
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dlg.FileName
}
"#;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", script])
        .output()
        .await
        .map_err(|e| format!("Failed to open file dialog: {e}"))?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn save_dialog(_default_name: &str) -> Result<Option<String>, String> {
    Err("Save dialog not yet implemented on this platform.".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn open_dialog() -> Result<Option<String>, String> {
    Err("Open dialog not yet implemented on this platform.".into())
}

/// Show a save dialog and write the provided bytes to the chosen path.
/// Returns the path the user picked, or `None` if cancelled.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_portable_agent(
    default_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let Some(path) = save_dialog(&default_name).await? else {
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
    let Some(path) = open_dialog().await? else {
        return Ok(None);
    };
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read selected file: {e}"))?;
    Ok(Some(bytes))
}
