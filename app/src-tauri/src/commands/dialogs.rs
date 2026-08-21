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

/// Decode a Windows dialog script's stdout into the chosen path.
///
/// The scripts print the path base64(UTF-8)-encoded rather than raw:
/// PowerShell encodes redirected stdout in the console's OEM code page
/// (cp850 on Spanish Windows), so an accented character anywhere in the
/// chosen path (`C:\Users\Muñoz\…`) arrived here as bytes that are not
/// valid UTF-8, turned into U+FFFD, and the save then failed with
/// "El sistema no puede encontrar la ruta especificada. (os error 3)"
/// (PRODUCT-1260). Base64 keeps the pipe pure ASCII, which every code
/// page maps identically. Empty output means the user cancelled.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn decode_dialog_path(stdout: &[u8]) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let trimmed = String::from_utf8_lossy(stdout).trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed.as_bytes())
        .map_err(|e| format!("The dialog returned an unreadable path: {e}"))?;
    let path = String::from_utf8(bytes)
        .map_err(|e| format!("The dialog returned an unreadable path: {e}"))?;
    Ok(if path.is_empty() { None } else { Some(path) })
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
    Write-Output ([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($dlg.FileName)))
}}
"#,
        powershell_escape(default_name),
        powershell_escape(filter),
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .creation_flags(crate::child_guard::CREATE_NO_WINDOW)
        .output()
        .await
        .map_err(|e| format!("Failed to open save dialog: {e}"))?;
    decode_dialog_path(&output.stdout)
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
    Write-Output ([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($dlg.FileName)))
}}
"#,
        powershell_escape(filter),
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .creation_flags(crate::child_guard::CREATE_NO_WINDOW)
        .output()
        .await
        .map_err(|e| format!("Failed to open file dialog: {e}"))?;
    decode_dialog_path(&output.stdout)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) async fn open_dialog(
    _prompt: &str,
    _win_filter: Option<&str>,
) -> Result<Option<String>, String> {
    Err("Open dialog not yet implemented on this platform.".into())
}

#[cfg(test)]
mod tests {
    use super::decode_dialog_path;
    use base64::Engine as _;

    fn b64(s: &str) -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .encode(s.as_bytes())
            .into_bytes()
    }

    #[test]
    fn decodes_accented_path() {
        // The PRODUCT-1260 shape: an accented Windows user folder that the
        // old raw-stdout decoding mangled into a nonexistent directory.
        let mut out = b64("C:\\Users\\Muñoz\\Descargas\\reporte.xlsx");
        out.extend_from_slice(b"\r\n");
        assert_eq!(
            decode_dialog_path(&out).unwrap(),
            Some("C:\\Users\\Muñoz\\Descargas\\reporte.xlsx".to_string()),
        );
    }

    #[test]
    fn empty_output_is_a_cancel() {
        assert_eq!(decode_dialog_path(b"").unwrap(), None);
        assert_eq!(decode_dialog_path(b"  \r\n").unwrap(), None);
        assert_eq!(decode_dialog_path(&b64("")).unwrap(), None);
    }

    #[test]
    fn garbage_output_errors_instead_of_saving_nowhere() {
        assert!(decode_dialog_path(b"not base64!!").is_err());
    }
}
