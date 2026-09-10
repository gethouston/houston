//! The wire shapes of the shell's resumable release download
//! (`update_fetch.rs`): the progress events and the typed failure the
//! frontend classifies (`app/src/lib/update-download-failure.ts`).

use serde::Serialize;

/// Mirrors the plugin's `DownloadEvent` so the frontend's progress fold
/// (`update-download-progress.ts`) reads both shapes unchanged.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

/// Why a download gave up. `Network` is the transport-shaped class (connect,
/// TLS, timeout, a body cut mid-stream): expected on a bad link, retried here
/// and reported quietly by the frontend. Everything else is a bug.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadFailureKind {
    Network,
    Http,
    Signature,
    Other,
}

/// The failure the frontend receives: the class, the message of the LAST
/// attempt, and where the stream stopped, so Sentry shows the byte position.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DownloadFailure {
    pub kind: DownloadFailureKind,
    pub message: String,
    pub received: u64,
    pub total: Option<u64>,
    pub attempts: u32,
}

impl DownloadFailure {
    pub fn other(message: impl Into<String>) -> Self {
        Self {
            kind: DownloadFailureKind::Other,
            message: message.into(),
            received: 0,
            total: None,
            attempts: 0,
        }
    }
}
