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
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::dialogs::save_dialog;
use super::file_failure::{write_with_fallback, FileOpFailure, WrittenFile};

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

/// Pick a save destination and write the payload there. Returns where the
/// file landed, or `None` when the user cancelled the dialog.
///
/// A destination the OS refuses to overwrite (open in Excel: Windows sharing
/// violation, HOUSTON-APP-53A) is written beside under a free `name (2).ext`
/// and reported as `renamed_from`; the remaining failures are typed so the
/// frontend can tell a protected folder from a bug (PRODUCT-1732).
///
/// Linux has no dialog helper yet (mirrors the portable share flow); there we
/// write straight into the OS download directory under a collision-free name,
/// which matches what a browser download would do anyway.
#[tauri::command]
pub async fn save_download(request: Request<'_>) -> Result<Option<WrittenFile>, FileOpFailure> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(FileOpFailure::other(
            "save_download expects a raw byte payload",
        ));
    };
    let name = requested_name(&request);
    let Some(path) = pick_destination(&name).await? else {
        return Ok(None);
    };
    write_with_fallback(&path, bytes).await.map(Some)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn pick_destination(name: &str) -> Result<Option<PathBuf>, FileOpFailure> {
    let picked = save_dialog("Save file", name, None)
        .await
        .map_err(FileOpFailure::other)?;
    Ok(picked.map(PathBuf::from))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn pick_destination(name: &str) -> Result<Option<PathBuf>, FileOpFailure> {
    // No native dialog on this platform — save into ~/Downloads like a
    // browser would, deduplicating "name.ext" → "name (2).ext".
    let dir = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| FileOpFailure::other("Could not resolve a download directory"))?;
    Ok(Some(super::file_failure::free_sibling(&dir.join(name))))
}
