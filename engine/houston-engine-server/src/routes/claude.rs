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

use crate::state::ServerState;
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use houston_ui_events::{ClaudeInstallError, HoustonEvent};
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
    /// Last install failure, as a typed [`ClaudeInstallError`] (`kind` +
    /// optional `detail`). `None` when install has never failed, or when
    /// the most recent attempt succeeded. The onboarding "Sign in with
    /// Anthropic" card reads this so it can distinguish "Houston tried
    /// but the network was down" from "the user hasn't connected yet"
    /// (issue #231); the frontend localizes `kind` (en/es/pt).
    last_install_error: Option<ClaudeInstallError>,
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
    // here so the UI doesn't render an empty-string error card. The
    // stored value is the JSON form of a `ClaudeInstallError`; a value
    // that doesn't parse is a legacy/corrupt marker from an older build,
    // so we log it and degrade to "no error" rather than 500 the status
    // call.
    let raw_last_error = st
        .engine
        .db
        .get_preference(houston_claude_installer::PREF_LAST_INSTALL_ERROR)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    let last_install_error = match raw_last_error {
        Some(s) => match serde_json::from_str::<ClaudeInstallError>(&s) {
            Ok(error) => Some(error),
            Err(parse_err) => {
                tracing::warn!(
                    "[claude] ignoring legacy/corrupt last-install-error preference: {parse_err}"
                );
                None
            }
        },
        None => None,
    };

    Json(ClaudeStatus {
        installed,
        install_path,
        pinned_version,
        installed_version,
        last_install_error,
    })
}

/// Trigger a fresh install in the background. The request returns
/// `202 Accepted` immediately; install progress + completion are emitted
/// as `HoustonEvent::ClaudeCliInstalling` / `ClaudeCliReady` /
/// `ClaudeCliFailed` over the WebSocket firehose.
///
/// Manifest resolution runs INSIDE the spawned task (via
/// `install_pinned`) so a missing or malformed manifest surfaces as a
/// typed `ClaudeCliFailed { ManifestMissing }` the UI can localize,
/// rather than a synchronous internal error string the frontend would
/// have shown verbatim (untranslated) on Retry.
async fn install(State(st): State<Arc<ServerState>>) -> StatusCode {
    let sink = st.engine.events.clone();
    let db = st.engine.db.clone();
    tokio::spawn(async move {
        sink.emit(HoustonEvent::ClaudeCliInstalling { progress_pct: 0 });
        let sink_for_progress = sink.clone();
        let outcome = houston_claude_installer::install_pinned(move |pct| {
            sink_for_progress.emit(HoustonEvent::ClaudeCliInstalling { progress_pct: pct });
        })
        .await;
        // Delegate to the shared finalizer so we write the same DB
        // markers (version + cleared/updated last-error) as the
        // boot-time `ensure_and_upgrade` path. The version is only used
        // on the success branch, so the error branch passes "".
        match outcome {
            Ok((version, path)) => {
                houston_claude_installer::finalize_install(&db, &version, &sink, Ok(path)).await;
            }
            Err(error) => {
                houston_claude_installer::finalize_install(&db, "", &sink, Err(error)).await;
            }
        }
    });

    StatusCode::ACCEPTED
}
