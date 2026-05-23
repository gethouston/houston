//! `/v1/claude/*` REST routes — runtime installer for Claude Code.
//!
//! Status + manual reinstall trigger for the proprietary Claude Code
//! CLI that Houston downloads on first launch (see
//! `houston_claude_installer`).
//!
//! Provides three endpoints:
//!
//! - `GET  /v1/claude/cli-installed` — quick boolean for the UI.
//! - `GET  /v1/claude/status`        — richer status (path, pinned vs
//!   installed version, manifest availability) for the diagnostics
//!   panel.
//! - `POST /v1/claude/install`       — re-run the install flow on
//!   demand (e.g. after the user fixes a network issue and clicks
//!   "Retry"). Returns 202-style — the install runs in the background
//!   and progress events stream over the WS firehose.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::CoreError;
use serde::Serialize;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/claude/cli-installed", get(cli_installed))
        .route("/claude/status", get(status))
        .route("/claude/install", post(install))
}

#[derive(Serialize)]
struct CliInstalled {
    installed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeStatus {
    /// True iff a `claude` binary exists at the install target with
    /// the executable bit set.
    installed: bool,
    /// Absolute install target, even if the binary isn't there yet.
    install_path: String,
    /// Version pinned by the bundled `cli-deps.json`. `None` when the
    /// manifest isn't available (degraded dev environment).
    pinned_version: Option<String>,
    /// Version we last successfully installed. `None` on first boot.
    /// Used by the lifecycle to decide whether to re-download on a
    /// Houston upgrade that bumps the pinned version.
    installed_version: Option<String>,
    /// Last install failure reason, classified for end users (see
    /// `houston_claude_installer::classify_reqwest_error`). `None` when
    /// install has never failed, or when the most recent attempt
    /// succeeded. The onboarding "Sign in with Anthropic" card reads
    /// this so it can distinguish "Houston tried but the network was
    /// down" from "the user hasn't connected yet" — issue #231.
    last_install_error: Option<String>,
}

fn lift(e: String) -> ApiError {
    ApiError(CoreError::Internal(e))
}

async fn cli_installed(State(_st): State<Arc<ServerState>>) -> Json<CliInstalled> {
    Json(CliInstalled {
        installed: houston_claude_installer::is_installed(),
    })
}

async fn status(State(st): State<Arc<ServerState>>) -> Json<ClaudeStatus> {
    let installed = houston_claude_installer::is_installed();
    let install_path = houston_claude_installer::cli_path()
        .to_string_lossy()
        .to_string();

    let pinned_version = houston_cli_bundle::load_bundled_manifest()
        .and_then(|m| m.entry("claude-code").map(|e| e.version));

    let installed_version = st
        .engine
        .db
        .get_preference(houston_claude_installer::PREF_INSTALLED_VERSION)
        .await
        .ok()
        .flatten();

    // Empty string is the cleared sentinel — the installer writes "" on
    // a successful retry rather than deleting the row, so we filter it
    // here so the UI doesn't render an empty-string error card.
    let last_install_error = st
        .engine
        .db
        .get_preference(houston_claude_installer::PREF_LAST_INSTALL_ERROR)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    Json(ClaudeStatus {
        installed,
        install_path,
        pinned_version,
        installed_version,
        last_install_error,
    })
}

/// Trigger a fresh install in the background. The request returns
/// immediately; install progress + completion are emitted as
/// `HoustonEvent::ClaudeCliInstalling` / `ClaudeCliReady` /
/// `ClaudeCliFailed` over the WebSocket firehose.
async fn install(State(st): State<Arc<ServerState>>) -> Result<(), ApiError> {
    let manifest = houston_cli_bundle::load_bundled_manifest()
        .ok_or_else(|| lift("cli-deps.json manifest not available — install pinned manifest first".into()))?;
    let entry = manifest
        .entry("claude-code")
        .ok_or_else(|| lift("cli-deps.json missing 'claude-code' entry".into()))?;
    let pinned_version = entry.version.clone();

    // Run the actual install on a background task so the HTTP request
    // returns immediately. The lifecycle entry would emit the same
    // events, but going through `install()` directly lets us run the
    // install even when the version marker already matches (manual
    // "reinstall" from the UI).
    let sink = st.engine.events.clone();
    let db = st.engine.db.clone();
    tokio::spawn(async move {
        sink.emit(houston_ui_events::HoustonEvent::ClaudeCliInstalling { progress_pct: 0 });
        let sink_for_progress = sink.clone();
        let result =
            houston_claude_installer::install(&entry, move |pct| {
                sink_for_progress
                    .emit(houston_ui_events::HoustonEvent::ClaudeCliInstalling { progress_pct: pct });
            })
            .await;
        // Delegate to the shared finalizer so we write the same DB
        // markers as the boot-time `ensure_and_upgrade` path. The
        // alternative (in-lining the writes here) drifted in the past:
        // the success branch persisted the version but neither branch
        // touched `claude_code_last_install_error`, so a successful
        // retry left a stale failure marker on disk.
        houston_claude_installer::finalize_install(&db, &pinned_version, &sink, result).await;
    });

    Ok(())
}
