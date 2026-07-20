//! `houston://store/install` deep-link bridge for one-click Agent Store installs.
//!
//! The Agent Store website (`agentstore/`) opens `houston://store/install?slug=<slug>`
//! to hand a store agent's slug to the desktop app. The shell forwards it to the
//! frontend over the `store://deep-link` event, which seeds the import-from-friend
//! wizard preview (a scan + name + pickers step — never an auto-install).
//!
//! Cold start: when the OS launches the app *by* the deep link, the webview may not
//! have registered its `store://deep-link` listener yet, so the raw URL is also
//! stashed in `PendingStoreDeepLinkState`. The frontend drains it once on mount via
//! `take_pending_store_deep_link` — the same race-free pull pattern that
//! `EngineHandshakeState` / `get_engine_handshake` use for the engine handshake.
//!
//! This channel is intentionally disjoint from the `auth://deep-link` channel: an
//! arbitrary store link can never inject onto the auth surface, and vice versa.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Tauri-managed state for the store-install deep link.
///
/// `pending` holds the raw URL captured before the webview's `store://deep-link`
/// listener was ready (cold start), drained once by `take_pending_store_deep_link`.
/// `listener_ready` flips true the first time the frontend drains — from then on a
/// live listener catches the emit, so later deep links must NOT be stashed:
/// residue in `pending` would be re-drained as a stale slug by a webview reload
/// (Cmd+R / HMR in dev, or a content-process crash-reload) and re-seed an install
/// the user already handled.
#[derive(Default)]
pub struct PendingStoreDeepLinkState {
    pending: Mutex<Option<String>>,
    listener_ready: AtomicBool,
}

impl PendingStoreDeepLinkState {
    /// Stash the URL only while cold (no live frontend listener yet). A no-op once
    /// the frontend has drained, so the warm path leaves no residue.
    fn stash_if_cold(&self, url: &str) {
        if self.listener_ready.load(Ordering::Relaxed) {
            return;
        }
        match self.pending.lock() {
            Ok(mut guard) => *guard = Some(url.to_string()),
            Err(e) => tracing::error!("[store] pending deep-link stash lock poisoned: {e}"),
        }
    }

    /// Drain (return and clear) the stash and mark the frontend listener live: the
    /// first drain closes the cold-start window, so later deep links only emit.
    fn drain(&self) -> Result<Option<String>, String> {
        self.listener_ready.store(true, Ordering::Relaxed);
        let mut guard = self.pending.lock().map_err(|e| e.to_string())?;
        Ok(guard.take())
    }
}

/// True iff a real OS deep link is the store-install shape the frontend consumes
/// (`houston://store/install?...`). The trailing char must be a boundary (`?`, `/`,
/// or end) so `houston://store/installEVIL` can never masquerade as an install —
/// mirrors `auth::is_auth_callback_deep_link`.
pub fn is_store_install_deep_link(url: &str) -> bool {
    match url.strip_prefix("houston://store/install") {
        Some(rest) => rest.is_empty() || rest.starts_with('?') || rest.starts_with('/'),
        None => false,
    }
}

/// Emit the raw store-install URL onto the `store://deep-link` event for a webview
/// that is already listening, and stash it for the cold-start pull ONLY while no
/// listener is live yet. Called from the `on_open_url` handler in `lib.rs`.
pub fn stash_and_emit(handle: &AppHandle, state: &PendingStoreDeepLinkState, url: &str) {
    state.stash_if_cold(url);
    if let Err(e) = handle.emit("store://deep-link", url) {
        tracing::error!("[store] failed to emit deep-link event: {e}");
    }
}

/// Drain (return and clear) the stashed store-install deep-link URL. The frontend
/// calls this once on mount to catch a cold-start launch whose event fired before
/// its listener registered; the first call also marks the listener live so later
/// deep links are no longer stashed.
#[tauri::command]
pub fn take_pending_store_deep_link(
    state: tauri::State<'_, PendingStoreDeepLinkState>,
) -> Result<Option<String>, String> {
    state.drain()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_install_deep_links_are_recognized() {
        assert!(is_store_install_deep_link(
            "houston://store/install?slug=my-agent"
        ));
        assert!(is_store_install_deep_link("houston://store/install"));
        assert!(is_store_install_deep_link("houston://store/install/"));
    }

    #[test]
    fn cold_start_stashes_then_drain_clears_and_marks_listener_live() {
        let state = PendingStoreDeepLinkState::default();
        // Cold start: URL arrives before the frontend listener is ready → stashed.
        state.stash_if_cold("houston://store/install?slug=cold");
        assert_eq!(
            state.drain().unwrap().as_deref(),
            Some("houston://store/install?slug=cold"),
        );
        // Drain clears the stash.
        assert_eq!(state.drain().unwrap(), None);
    }

    #[test]
    fn warm_deep_link_after_drain_leaves_no_residue() {
        let state = PendingStoreDeepLinkState::default();
        // Frontend mounts and drains once — its listener is now live.
        assert_eq!(state.drain().unwrap(), None);
        // Warm deep link: the live listener catches the emit, so nothing must be
        // stashed. Otherwise a webview reload would re-drain this stale slug and
        // re-seed an install the user already handled.
        state.stash_if_cold("houston://store/install?slug=warm");
        assert_eq!(state.drain().unwrap(), None);
    }

    #[test]
    fn non_install_deep_links_are_ignored() {
        assert!(!is_store_install_deep_link("houston://store/installer?x=1"));
        assert!(!is_store_install_deep_link("houston://open"));
        assert!(!is_store_install_deep_link(
            "https://example.com/store/install"
        ));
    }
}
