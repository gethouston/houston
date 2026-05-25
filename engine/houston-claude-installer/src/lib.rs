//! Runtime installer for Anthropic's Claude Code CLI.
//!
//! Why a runtime installer instead of bundling? Claude Code ships under
//! a proprietary license that doesn't permit redistribution inside
//! Houston's bundle. So we detect the missing CLI on first launch and
//! download it, no terminal required.
//!
//! Why not `curl https://claude.ai/install.sh | bash`?
//!   1. **Reproducibility** — we pin a version + SHA-256 in
//!      `cli-deps.json` (bundled via `houston-cli-bundle`). Upstream
//!      chases "latest", which would silently roll versions and break
//!      the lockstep we use to validate compatibility.
//!   2. **Verifiability** — every byte is checksum-verified before
//!      the executable bit is set. Extends the .app's trust chain to
//!      the runtime download.
//!   3. **No bash dep**.
//!   4. **Progress events** — `HoustonEvent`s drive a real progress UI.
//!
//! ## Module split (each stays under the 200-line cap)
//!
//! - `lib.rs` — lifecycle entry + decision tree.
//! - `download` — download / verify / atomic-install pipeline.
//! - `manifest` — `cli-deps.json` resolution (bundled vs dev-checkout).
//! - `marker` — installed-version DB marker + persistence policy.

mod download;
mod error;
mod finalize;
mod manifest;
mod marker;

use houston_db::db::Database;
use houston_ui_events::{DynEventSink, HoustonEvent};

// Re-export so existing call sites (lifecycle, routes/claude.rs,
// provider/resolve.rs) keep working unchanged after the extraction.
pub use download::{install, install_to};
pub use marker::{persist_version_or_warn, PREF_INSTALLED_VERSION};

// Path-resolution functions live in `houston-terminal-manager` so the
// spawn-side code (`claude_path`, `claude_runner`) shares one source of
// truth with the install-side code below. Re-exported here for callers
// that import from this crate.
pub use houston_terminal_manager::claude_install_path::{
    binary_name, cli_path, install_dir, is_installed,
};

/// CLI key inside `cli-deps.json`. Constant so we don't string-literal
/// the same value across modules.
const CLI_KEY: &str = "claude-code";

/// Lifecycle entry — call once at engine startup as a background task.
///
/// Decision tree:
/// - No manifest available → log + emit `ClaudeCliReady` (the engine
///   never blocks on claude install; the user might be on Codex).
/// - Already installed at the pinned version → emit `ClaudeCliReady`.
/// - Not installed, or installed at a different version →
///   download/verify/install, then emit `ClaudeCliReady`.
/// - Download/verify failure → emit `ClaudeCliFailed { message }` with
///   actionable hint (version + URL + status/checksum + target).
///
/// Surfacing path (engine side): `message` threads through the WS
/// firehose to `app/src/hooks/use-claude-cli-events.ts`, which routes
/// the failure into the toast store. The frontend hook is what closes
/// the loop for #231 — the engine alone can only emit; without a
/// subscriber the events go to /dev/null.
pub async fn ensure_and_upgrade(sink: DynEventSink, db: Database) {
    let Some(m) = manifest::resolve_manifest() else {
        tracing::warn!("[claude-installer] no cli-deps.json available; skipping auto-install");
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    };

    let Some(entry) = m.entry(CLI_KEY) else {
        tracing::warn!(
            "[claude-installer] cli-deps.json missing '{}' entry; skipping auto-install",
            CLI_KEY
        );
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    };

    if entry.bundled {
        tracing::info!(
            "[claude-installer] manifest reports claude-code as bundled; trusting bundle"
        );
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    }

    let pinned_version = entry.version.clone();
    let last_version = marker::read_or_warn(&db).await;

    if is_installed() && last_version == pinned_version {
        tracing::info!(
            "[claude-installer] already at pinned version {}, skipping",
            pinned_version
        );
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    }

    tracing::info!(
        "[claude-installer] installing claude-code v{} ({} -> {})",
        pinned_version,
        if last_version.is_empty() { "none" } else { &last_version },
        pinned_version
    );

    sink.emit(HoustonEvent::ClaudeCliInstalling { progress_pct: 0 });

    let sink_for_progress = sink.clone();
    let result = install(&entry, move |pct| {
        sink_for_progress.emit(HoustonEvent::ClaudeCliInstalling { progress_pct: pct });
    })
    .await;

    match result {
        Ok(path) => {
            tracing::info!("[claude-installer] installed at {}", path.display());
            persist_version_or_warn(&db, &pinned_version, &sink).await;
            sink.emit(HoustonEvent::ClaudeCliReady);
        }
        Err(e) => {
            // `e` already carries version + URL + status/checksum + target.
            // Subscriber: `app/src/hooks/use-claude-cli-events.ts`.
            tracing::error!("[claude-installer] install failed: {e}");
            sink.emit(HoustonEvent::ClaudeCliFailed { message: e });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_path_is_under_install_dir() {
        let cli = cli_path();
        let dir = install_dir();
        assert!(cli.starts_with(&dir), "{} not under {}", cli.display(), dir.display());
    }
}
