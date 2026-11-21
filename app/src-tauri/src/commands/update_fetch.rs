//! Resumable release download (PRODUCT-1727).
//!
//! `tauri-plugin-updater` fetches a release in ONE streamed request with no
//! retry: a 300 MB `Houston.app.tar.gz` on a flaky link dies mid-body as
//! "error decoding response body". This loop streams into a persisted partial
//! (`update_partial`) and asks the server for the rest with `Range` +
//! `If-Range` (GitHub release assets answer 206), backing off between
//! attempts. A budget that runs out KEEPS the file: the next call (the
//! 5-minute poll, the device coming back online) carries on from where it
//! stopped instead of from byte 0, which is the difference between a link that
//! drops every 100 MB finishing a 330 MB asset and never finishing it. A
//! server that answers a full body (200: it ignored the range, or the asset
//! was re-published and the validator no longer matches) restarts the file,
//! and the caller's tally with it through a fresh `Started` event. A transient
//! status from the release host (a 504 from GitHub's asset CDN mid-roll,
//! PRODUCT-1811) is retried the same way. Pure over a `reqwest::Client` so
//! the tests run it against a local socket.

use super::update_attempt::{attempt, AttemptOutcome};
pub use super::update_failure::{DownloadEvent, DownloadFailure};
use super::update_partial::PartialDownload;
use reqwest::header::HeaderMap;
use reqwest::{Client, Url};
use std::time::Duration;

/// The most attempts one call makes: the first request plus four resumes.
/// A caller that must not keep the user waiting (the launch-time install
/// behind its overlay) asks for fewer; the partial survives either way.
pub const DOWNLOAD_ATTEMPTS: u32 = 5;

/// Backoff before each resume, in seconds. The old 1/3/9 s ladder waited 13 s
/// in total, shorter than an ordinary wifi hiccup; this one waits past a
/// minute before leaving the rest to the next call.
const RETRY_DELAYS_SECS: [u64; 4] = [3, 10, 30, 60];

/// Backoff before resume attempt `attempt` (1-based, the retries only),
/// capped at the last rung.
pub fn retry_delay(attempt: u32) -> Duration {
    let index = (attempt.saturating_sub(1) as usize).min(RETRY_DELAYS_SECS.len() - 1);
    Duration::from_secs(RETRY_DELAYS_SECS[index])
}

/// A caller's attempt budget, held to `1..=DOWNLOAD_ATTEMPTS`.
pub fn attempt_budget(requested: Option<u32>) -> u32 {
    requested
        .unwrap_or(DOWNLOAD_ATTEMPTS)
        .clamp(1, DOWNLOAD_ATTEMPTS)
}

/// Complete `partial` from `url` across up to `attempts` tries. On success
/// the file at `partial.path()` holds the whole asset, unverified. A dropped
/// stream and a transient status both retry, and leave the file for the next
/// call when the budget runs out; any other failure is final and discards it.
/// The caller's tally is primed with what was already on disk.
pub async fn fetch_with_resume(
    client: &Client,
    url: &Url,
    headers: &HeaderMap,
    partial: &mut PartialDownload,
    attempts: u32,
    mut on_event: impl FnMut(DownloadEvent) + Send,
) -> Result<(), DownloadFailure> {
    if partial.len() > 0 {
        on_event(DownloadEvent::Started {
            content_length: partial.total(),
        });
        on_event(DownloadEvent::Progress {
            chunk_length: partial.len() as usize,
        });
    }
    let mut last: Option<DownloadFailure> = None;
    for attempt_no in 1..=attempts {
        if attempt_no > 1 {
            tokio::time::sleep(retry_delay(attempt_no - 1)).await;
        }
        let mut outcome = attempt(client, url, headers, partial, &mut on_event).await;
        if let Err(e) = partial.settle().await {
            tracing::warn!("[updater] flush partial download: {e}");
            if matches!(outcome, Ok(AttemptOutcome::Done)) {
                outcome = Err(DownloadFailure::io("flush partial download", &e));
            } else if let Err(e) = partial.resync_len() {
                outcome = Err(DownloadFailure::io("measure partial download", &e));
            }
        }
        let mut failure = match outcome {
            Ok(AttemptOutcome::Done) => {
                on_event(DownloadEvent::Finished);
                return Ok(());
            }
            Ok(AttemptOutcome::Retry(failure)) => failure,
            Err(failure) => failure,
        };
        failure.attempts = attempt_no;
        tracing::warn!(
            "[updater] download attempt {attempt_no}/{attempts} stopped at {}/{} bytes: {}",
            failure.received,
            failure.total.map_or("?".to_string(), |t| t.to_string()),
            failure.message
        );
        if !failure.kind.is_retryable() {
            if let Err(e) = partial.discard() {
                tracing::warn!("[updater] discard partial download: {e}");
            }
            return Err(failure);
        }
        last = Some(failure);
    }
    Err(last.unwrap_or_else(|| DownloadFailure::other("download made no attempt")))
}

#[cfg(test)]
#[path = "update_fetch_tests.rs"]
mod tests;
