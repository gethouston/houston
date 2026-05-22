//! Installed-version marker persistence + recovery policy.
//!
//! The marker (`PREF_INSTALLED_VERSION` in the engine DB) lets a future
//! boot decide whether to re-download claude-code. Without it, every
//! launch would re-fetch ~120 MB. Persistence failure is therefore
//! user-visible: we surface it as a non-fatal `ClaudeCliFailed` toast
//! so the user knows their next launch will redownload until the DB
//! is reachable.
//!
//! This module is the "marker policy" sibling of `download` (binary
//! policy) and `manifest` (lookup policy). Keeping them separate keeps
//! `lib.rs` under the CLAUDE.md §"File size limits" 200-line cap and
//! lets us test each in isolation.

use houston_db::db::Database;
use houston_ui_events::{DynEventSink, HoustonEvent};

/// Engine-DB preferences key holding the last successfully-installed
/// claude-code version. Lifecycle compares it against the manifest's
/// pinned version on every boot.
pub const PREF_INSTALLED_VERSION: &str = "claude_code_installed_version";

/// Read the marker for the last successful install, or `String::new()`
/// on first boot OR on DB error. The DB error case is logged at WARN
/// with full context so support can diagnose why the user sees
/// boot-time redownloads.
///
/// allow-silent-failure: DB unavailable when reading the version
/// marker is treated as "needs install" (the safe path — we'll
/// re-verify the checksum and either skip or reinstall idempotently).
pub(crate) async fn read_or_warn(db: &Database) -> String {
    match db.get_preference(PREF_INSTALLED_VERSION).await {
        // allow-silent-failure: `Ok(None)` is a DOMAIN answer ("no marker
        // stored yet" = first boot), not a failure. CLAUDE.md bans
        // `.unwrap_or*` over user-initiated failures; this is the
        // success path of the DB read where empty marker is the
        // legitimate state of the world.
        Ok(v) => v.unwrap_or_default(),
        Err(e) => {
            tracing::warn!(
                "[claude-installer] failed to read pref '{}': {e}; treating as needs-install",
                PREF_INSTALLED_VERSION
            );
            String::new()
        }
    }
}

/// Persist the installed-version marker, or surface a non-fatal warning
/// to the user. Previously classified RECOVERABLE under the (incorrect)
/// assumption that the next boot would redetect via SHA-256, but the
/// version-marker read returns `""` on DB error and forces a 120 MB
/// redownload every boot. That's a beta-surface bug, not a silent
/// recovery.
///
/// Policy now: the install itself succeeded on disk, so the caller
/// still emits `ClaudeCliReady` (functional state correct), BUT we
/// also emit a secondary `ClaudeCliFailed` carrying the marker-persist
/// context so the user sees a toast warning that subsequent boots will
/// redownload until the DB is reachable. The user can either fix the
/// DB or accept the per-boot cost.
pub async fn persist_version_or_warn(db: &Database, pinned_version: &str, sink: &DynEventSink) {
    if let Err(e) = db
        .set_preference(PREF_INSTALLED_VERSION, pinned_version)
        .await
    {
        // Per CLAUDE.md §"No silent failures": surface, don't swallow.
        let msg = format!(
            "claude-code v{pinned_version}: installed successfully, but the version marker \
             (pref \"{PREF_INSTALLED_VERSION}\") could not be saved: {e}. \
             The next launch will re-download (~120 MB). Restart Houston after fixing the issue \
             to avoid the redownload."
        );
        tracing::warn!("[claude-installer] {msg}");
        sink.emit(HoustonEvent::ClaudeCliFailed { message: msg });
    }
}
