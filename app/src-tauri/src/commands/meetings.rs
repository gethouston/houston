//! OS-native Tauri commands for the Meetings feature.
//!
//! Pure OS glue — no domain logic. Opens/closes a WebviewWindow for
//! meet.google.com and injects `captions_bridge.js` via
//! `initialization_script`.
//!
//! Caption relay: the bridge JS calls the houston-engine REST API directly
//! (`POST /v1/meetings/:id/captions`). The engine has permissive CORS for
//! loopback, so fetch() from meet.google.com to 127.0.0.1:<port> works
//! without Tauri IPC from an external-origin webview.

use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

/// Args for `meeting_open_window`, sent from React.
///
/// `engine_url` and `engine_token` come from `window.__HOUSTON_ENGINE__`
/// (bootstrapped by the engine supervisor in `lib.rs`) so the bridge JS can
/// POST captions to the running engine instance.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenMeetingArgs {
    pub meeting_id: String,
    pub meet_url: String,
    pub bot_name: Option<String>,
    pub agent_path: String,
    pub engine_url: String,
    pub engine_token: String,
}

/// Open a WebviewWindow for a Google Meet session.
///
/// Injects the engine coordinates and `captions_bridge.js` into the page so
/// the bridge can scrape and POST captions without needing Tauri IPC from an
/// external origin.
#[tauri::command]
pub async fn meeting_open_window(
    app: AppHandle,
    args: OpenMeetingArgs,
) -> Result<(), String> {
    let label = window_label(&args.meeting_id);

    // Close any stale window from a previous attempt with the same id.
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let bridge_js = include_str!("../meetings/captions_bridge.js");

    // Use serde_json to produce safe JSON string literals — handles
    // Windows backslashes, quotes, and other special characters.
    let vars_js = format!(
        "window.__HOUSTON_ENGINE_URL__ = {engine_url};\
         window.__HOUSTON_ENGINE_TOKEN__ = {engine_token};\
         window.__HOUSTON_MEETING_ID__ = {meeting_id};\
         window.__HOUSTON_AGENT_PATH__ = {agent_path};\
         window.__HOUSTON_BOT_NAME__ = {bot_name};",
        engine_url = serde_json::to_string(&args.engine_url)
            .map_err(|e| e.to_string())?,
        engine_token = serde_json::to_string(&args.engine_token)
            .map_err(|e| e.to_string())?,
        meeting_id = serde_json::to_string(&args.meeting_id)
            .map_err(|e| e.to_string())?,
        agent_path = serde_json::to_string(&args.agent_path)
            .map_err(|e| e.to_string())?,
        bot_name = serde_json::to_string(
            args.bot_name.as_deref().unwrap_or("Houston")
        )
        .map_err(|e| e.to_string())?,
    );

    let init_script = format!("{vars_js}\n{bridge_js}");

    let url: Url = args
        .meet_url
        .parse()
        .map_err(|e| format!("invalid meet URL: {e}"))?;

    let title = format!(
        "{} \u{2014} Houston",
        args.bot_name.as_deref().unwrap_or("Meeting")
    );

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .title(title)
        .initialization_script(&init_script)
        .inner_size(1280.0, 800.0)
        .build()
        .map_err(|e| format!("failed to open meeting window: {e}"))?;

    Ok(())
}

/// Close the WebviewWindow for the given meeting, if it is open.
#[tauri::command]
pub async fn meeting_close_window(
    app: AppHandle,
    meeting_id: String,
) -> Result<(), String> {
    let label = window_label(&meeting_id);
    if let Some(win) = app.get_webview_window(&label) {
        win.close()
            .map_err(|e| format!("failed to close meeting window: {e}"))?;
    }
    Ok(())
}

/// Tauri window label for a meeting window.
/// Labels must be alphanumeric + hyphens in Tauri 2; UUIDs already fit.
fn window_label(meeting_id: &str) -> String {
    format!("meet-{meeting_id}")
}
