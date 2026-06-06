//! Composio CLI lifecycle — bundle-aware install + upgrade.
//!
//! Called once during engine startup as a background task:
//!
//! - **Bundled build**: detect the bundled CLI, emit `ComposioCliReady`,
//!   record the Houston version marker, return. No install, no upgrade
//!   — the bundled binary is the version we shipped, and overwriting it
//!   with `composio upgrade` would either fail (read-only `.app`) or
//!   silently write to `~/.composio/` and confuse the resolver next
//!   boot.
//!
//! - **Standalone build**: install the CLI if missing (one-time
//!   `curl | bash`), then run `composio upgrade` whenever Houston's
//!   version changes since the last successful check (so security fixes
//!   in the upstream CLI roll out alongside Houston releases without
//!   requiring user action).
//!
//! Emits `HoustonEvent::ComposioCliReady` on success so the frontend
//! invalidates the connections query and the integrations tab refreshes.

use crate::{cli, install};
use houston_db::db::Database;
use houston_ui_events::{DynEventSink, HoustonEvent};

/// Preferences key storing the Houston version that last successfully
/// ensured the standalone CLI. Skipped entirely for bundled builds.
const PREF_CLI_VERSION: &str = "composio_cli_houston_version";

/// Marker preference set the first time the forced-logout migration
/// ran successfully. Existence of this key means "we already kicked
/// every user out once on this version of the migration, don't do it
/// again." Bump the suffix (`_v3`, `_v4`, …) for any future incident
/// that requires another mass logout — reusing the same key would
/// silently skip everyone.
///
/// `_v2` because the first cut shipped with `composio logout -y`,
/// which the CLI rejects with exit 1 + usage text. Old wrapper
/// swallowed the exit code so the migration reported success without
/// actually logging anyone out. Bumping to `_v2` re-triggers the
/// migration with the fixed wrapper on any machine that still has
/// the poisoned `_v1` marker.
const PREF_FORCED_LOGOUT_V2: &str = "composio_forced_logout_v2";

/// Current Houston version (read from Cargo.toml at compile time).
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Run the full lifecycle check: install if missing, upgrade if Houston
/// version changed. Emits events so the frontend reacts.
pub async fn ensure_and_upgrade(sink: DynEventSink, db: Database) {
    forced_logout(&db).await;

    if install::is_bundled() {
        tracing::info!(
            "[composio:lifecycle] bundled CLI detected at {} — skipping install/upgrade",
            install::cli_path().display()
        );
        sink.emit(HoustonEvent::ComposioCliReady);
        return;
    }

    if !install::is_installed() {
        tracing::info!("[composio:lifecycle] CLI not found — auto-installing");
        match install::install().await {
            Ok(path) => {
                tracing::info!(
                    "[composio:lifecycle] auto-install succeeded: {}",
                    path.display()
                );
            }
            Err(e) => {
                tracing::error!("[composio:lifecycle] auto-install failed: {e}");
                sink.emit(HoustonEvent::ComposioCliFailed { message: e });
                return;
            }
        }
    }

    // Upgrade if Houston's version changed since last check. Bundled
    // builds never reach this branch — they returned early above.
    let last_version = db
        .get_preference(PREF_CLI_VERSION)
        .await
        .ok()
        .flatten()
        .unwrap_or_default();

    // Standalone installs: keep the CLI current. We used to upgrade only
    // when Houston's version changed, but an old `~/.composio/composio`
    // (e.g. 0.2.23) keeps printing "Update available" to stderr on every
    // agent invocation — PowerShell on Windows surfaces that as a false
    // failure. `composio upgrade` is idempotent when already current.
    if install::is_installed() {
        let reason = if last_version != APP_VERSION {
            format!(
                "Houston version changed ({} → {})",
                if last_version.is_empty() {
                    "none".to_string()
                } else {
                    last_version.clone()
                },
                APP_VERSION
            )
        } else {
            "standalone refresh".to_string()
        };
        tracing::info!("[composio:lifecycle] upgrading CLI ({reason})");
        match run_upgrade().await {
            Ok(()) => {
                tracing::info!("[composio:lifecycle] CLI upgrade succeeded");
            }
            Err(e) => {
                tracing::warn!("[composio:lifecycle] CLI upgrade failed (non-fatal): {e}");
            }
        }
        if let Err(e) = db.set_preference(PREF_CLI_VERSION, APP_VERSION).await {
            tracing::warn!("[composio:lifecycle] failed to persist version marker: {e}");
        }
    }

    sink.emit(HoustonEvent::ComposioCliReady);
}

/// One-time forced logout, gated by [`PREF_FORCED_LOGOUT_V2`].
///
/// Runs before the bundled / standalone branches so every existing
/// user gets signed out exactly once on the first launch of the
/// release that ships this migration. If the logout shell-out fails
/// we leave the marker unset so the next launch retries — better to
/// re-run the (idempotent) `composio logout` once more than to leave
/// a user still signed in believing they're not.
async fn forced_logout(db: &Database) {
    let already_done = db
        .get_preference(PREF_FORCED_LOGOUT_V2)
        .await
        .ok()
        .flatten()
        .is_some();
    if already_done {
        return;
    }

    if !install::is_installed() {
        tracing::info!(
            "[composio:lifecycle] forced logout: CLI not installed, nothing to clear"
        );
        if let Err(e) = db.set_preference(PREF_FORCED_LOGOUT_V2, "1").await {
            tracing::warn!(
                "[composio:lifecycle] failed to persist forced-logout marker: {e}"
            );
        }
        return;
    }

    tracing::info!("[composio:lifecycle] running forced logout (one-time migration)");
    match cli::logout().await {
        Ok(()) => {
            tracing::info!("[composio:lifecycle] forced logout succeeded");
            if let Err(e) = db.set_preference(PREF_FORCED_LOGOUT_V2, "1").await {
                tracing::warn!(
                    "[composio:lifecycle] failed to persist forced-logout marker: {e} \
                     (migration will retry next launch)"
                );
            }
        }
        Err(e) => {
            tracing::warn!(
                "[composio:lifecycle] forced logout failed: {e} — will retry next launch"
            );
        }
    }
}

/// Run `composio upgrade` via the same sync-Command + spawn_blocking
/// pattern used by the install function. Standalone-only — never called
/// when the bundled CLI is present (would try to overwrite a read-only
/// signed binary inside the `.app`).
async fn run_upgrade() -> Result<(), String> {
    let bin = install::cli_path();
    let home = install::home_dir().to_string_lossy().to_string();
    let path = std::env::var("PATH").unwrap_or_default();

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(180),
        tokio::task::spawn_blocking(move || {
            let mut cmd = std::process::Command::new(&bin);
            cmd.arg("upgrade")
                .env("CI", "1")
                .env("TERM", "dumb")
                .env("NO_COLOR", "1")
                .env("PATH", &path)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped());
            install::set_home_env(&mut cmd, &home);
            let status = cmd
                .status()
                .map_err(|e| format!("Failed to spawn composio upgrade: {e}"))?;

            if !status.success() {
                return Err(format!("composio upgrade exited with {status}"));
            }
            Ok(())
        }),
    )
    .await
    .map_err(|_| "composio upgrade timed out after 3 minutes".to_string())?
    .map_err(|e| format!("upgrade thread failed: {e}"))?;

    result
}
