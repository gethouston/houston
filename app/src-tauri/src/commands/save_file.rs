//! Save downloaded workspace bytes to the user's machine.
//!
//! The desktop webview (WKWebView on macOS) ignores `<a download>` clicks on
//! `blob:` URLs, so the Files tab's Download actions can't rely on the
//! browser's download machinery like the web build does (HOU-703). Instead
//! the frontend fetches the bytes itself (with auth) and hands them to this
//! command, which shows an OS save dialog and writes the file natively.
//!
//! The bytes arrive as a raw IPC payload (`InvokeBody::Raw`), NOT a JSON
//! array — workspace archives can be hundreds of megabytes and JSON-encoding
//! them number-by-number would freeze the webview. The filename travels in
//! the percent-encoded `x-download-name` request header.

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::dialogs::save_dialog;

/// The suggested filename, decoded from the `x-download-name` header and
/// stripped of path separators so it can't steer the dialog's directory.
fn requested_name(request: &Request<'_>) -> String {
    let raw = request
        .headers()
        .get("x-download-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let decoded = percent_decode_str(raw).decode_utf8_lossy();
    let cleaned = decoded.replace(['/', '\\'], "-").trim().to_string();
    if cleaned.is_empty() {
        "download".to_string()
    } else {
        cleaned
    }
}

/// Pick a save destination and write the payload there. Returns the chosen
/// path, or `None` when the user cancelled the dialog.
///
/// Linux has no dialog helper yet (mirrors the portable share flow); there we
/// write straight into the OS download directory under a collision-free name,
/// which matches what a browser download would do anyway.
#[tauri::command]
pub async fn save_download(request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_download expects a raw byte payload".into());
    };
    let name = requested_name(&request);
    let Some(path) = pick_destination(&name).await? else {
        return Ok(None);
    };
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| format!("Failed to save file: {e}"))?;
    Ok(Some(path))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn pick_destination(name: &str) -> Result<Option<String>, String> {
    save_dialog("Save file", name, None).await
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn pick_destination(name: &str) -> Result<Option<String>, String> {
    // No native dialog on this platform — save into ~/Downloads like a
    // browser would, deduplicating "name.ext" → "name (2).ext".
    let dir = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Could not resolve a download directory".to_string())?;
    Ok(Some(dedupe_path(&dir, name).to_string_lossy().into_owned()))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn dedupe_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    (2u32..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("some free filename exists")
}
