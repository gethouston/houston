//! OS-native file dialogs shared by the commands that save/open files on the
//! user's machine (portable agent share/import, workspace file downloads).
//!
//! Shells out to osascript on macOS and PowerShell on Windows so we don't
//! pull in a Tauri dialog plugin for a handful of operations. Callers pass
//! the user-visible prompt; the Windows save dialog additionally takes an
//! optional `"label|*.ext"` filter.

use tokio::process::Command;

/// Escape a string for interpolation inside an AppleScript double-quoted
/// literal (filenames can contain `"` and `\`).
#[cfg(target_os = "macos")]
fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Escape a string for interpolation inside a PowerShell single-quoted
/// literal (only `'` is special there).
#[cfg(target_os = "windows")]
fn powershell_escape(s: &str) -> String {
    s.replace('\'', "''")
}

#[cfg(target_os = "macos")]
pub(crate) async fn save_dialog(
    prompt: &str,
    default_name: &str,
    _win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    let script = format!(
        r#"POSIX path of (choose file name with prompt "{}" default name "{}")"#,
        applescript_escape(prompt),
        applescript_escape(default_name),
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
pub(crate) async fn save_dialog(
    _prompt: &str,
    default_name: &str,
    win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    let filter = win_filter.unwrap_or("All files (*.*)|*.*");
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dlg = New-Object System.Windows.Forms.SaveFileDialog
$dlg.FileName = '{}'
$dlg.Filter = '{}'
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dlg.FileName
}}
"#,
        powershell_escape(default_name),
        powershell_escape(filter),
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to open save dialog: {e}"))?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) async fn save_dialog(
    _prompt: &str,
    _default_name: &str,
    _win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    Err("Save dialog not yet implemented on this platform.".into())
}

#[cfg(target_os = "macos")]
pub(crate) async fn open_dialog(
    prompt: &str,
    _win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    // `choose file` always returns a POSIX path. The user can pick any
    // extension; callers validate the bytes.
    let script = format!(
        r#"POSIX path of (choose file with prompt "{}")"#,
        applescript_escape(prompt),
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
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
pub(crate) async fn open_dialog(
    _prompt: &str,
    win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    let filter = win_filter.unwrap_or("All files (*.*)|*.*");
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Filter = '{}'
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dlg.FileName
}}
"#,
        powershell_escape(filter),
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to open file dialog: {e}"))?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) async fn open_dialog(
    _prompt: &str,
    _win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    Err("Open dialog not yet implemented on this platform.".into())
}
