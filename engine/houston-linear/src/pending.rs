//! In-memory pending-OAuth state map.
//!
//! Lives across the two REST calls (`/connect` start + the callback
//! handler) without persisting to disk. Short-lived (10-minute TTL).
//! Validates the CSRF `state` token before letting the code-exchange
//! step run.

use crate::error::LinearError;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// State token expires after 10 minutes — enough for a user to OAuth
/// in the browser, not enough for a token to leak from logs and be
/// reused much later.
const STATE_TTL: Duration = Duration::from_secs(10 * 60);

/// Per-workspace pending OAuth state (CSRF token + expiry).
#[derive(Debug, Clone)]
struct PendingState {
    state_token: String,
    expires_at: Instant,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

/// In-memory map `workspace_path → pending OAuth state`. Thread-safe
/// via [`Mutex`]; writes are rare and there is no async work inside
/// the critical section.
#[derive(Debug, Default)]
pub struct PendingStore {
    inner: Mutex<HashMap<PathBuf, PendingState>>,
}

impl PendingStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a pending OAuth attempt for `workspace_path`. Replaces
    /// any prior pending state for the same workspace (only one
    /// in-flight attempt per workspace makes sense).
    pub fn start(
        &self,
        workspace_path: &Path,
        state_token: String,
        client_id: String,
        client_secret: String,
        redirect_uri: String,
    ) {
        let mut map = self.inner.lock().expect("PendingStore mutex poisoned");
        map.insert(
            workspace_path.to_path_buf(),
            PendingState {
                state_token,
                expires_at: Instant::now() + STATE_TTL,
                client_id,
                client_secret,
                redirect_uri,
            },
        );
    }

    /// Consume + verify the pending state for `workspace_path`. Returns
    /// the OAuth credentials needed to exchange the code, or an error
    /// if state is missing, expired, or doesn't match.
    pub fn take(
        &self,
        workspace_path: &Path,
        provided_state: &str,
    ) -> Result<TakenState, LinearError> {
        let mut map = self.inner.lock().expect("PendingStore mutex poisoned");
        let entry = map
            .remove(workspace_path)
            .ok_or_else(|| LinearError::Oauth("no pending OAuth state for workspace".into()))?;

        if entry.expires_at < Instant::now() {
            return Err(LinearError::Oauth("OAuth state token expired".into()));
        }
        if entry.state_token != provided_state {
            return Err(LinearError::Oauth(
                "OAuth state token mismatch — possible CSRF".into(),
            ));
        }
        Ok(TakenState {
            client_id: entry.client_id,
            client_secret: entry.client_secret,
            redirect_uri: entry.redirect_uri,
        })
    }
}

/// Output of [`PendingStore::take`] — the verified OAuth credentials
/// needed to exchange a code for tokens.
#[derive(Debug, Clone)]
pub struct TakenState {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_store_round_trip() {
        let store = PendingStore::new();
        let ws = PathBuf::from("/tmp/test-ws");
        store.start(
            &ws,
            "state_abc".into(),
            "cid".into(),
            "csec".into(),
            "http://localhost:19824/callback".into(),
        );
        let taken = store.take(&ws, "state_abc").unwrap();
        assert_eq!(taken.client_id, "cid");
        assert_eq!(taken.client_secret, "csec");
        assert_eq!(taken.redirect_uri, "http://localhost:19824/callback");
    }

    #[test]
    fn pending_state_token_mismatch_rejected() {
        let store = PendingStore::new();
        let ws = PathBuf::from("/tmp/test-ws-2");
        store.start(
            &ws,
            "state_abc".into(),
            "cid".into(),
            "csec".into(),
            "http://localhost:19824/callback".into(),
        );
        let err = store.take(&ws, "state_wrong").unwrap_err();
        assert!(matches!(err, LinearError::Oauth(_)));
    }

    #[test]
    fn pending_state_consumed_once() {
        let store = PendingStore::new();
        let ws = PathBuf::from("/tmp/test-ws-3");
        store.start(
            &ws,
            "state_abc".into(),
            "cid".into(),
            "csec".into(),
            "http://localhost:19824/callback".into(),
        );
        store.take(&ws, "state_abc").unwrap();
        let err = store.take(&ws, "state_abc").unwrap_err();
        assert!(matches!(err, LinearError::Oauth(_)));
    }

    #[test]
    fn missing_pending_state_rejected() {
        let store = PendingStore::new();
        let err = store
            .take(&PathBuf::from("/tmp/never-started"), "any")
            .unwrap_err();
        assert!(matches!(err, LinearError::Oauth(_)));
    }
}
