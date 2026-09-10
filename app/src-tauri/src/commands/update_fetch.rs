//! Resumable release download (PRODUCT-1727).
//!
//! `tauri-plugin-updater` fetches a release in ONE streamed request with no
//! retry: a 300 MB `Houston.app.tar.gz` on a flaky link dies mid-body as
//! "error decoding response body" and the whole download starts over on the
//! next poll. This loop keeps the bytes it already has and asks the server
//! for the rest with a `Range` header (GitHub release assets answer 206),
//! backing off between attempts. A server that ignores the range (answers
//! 200) restarts the buffer, so the caller's progress tally is reset by a
//! fresh `Started` event. Pure over a `reqwest::Client` so the tests can run
//! it against a local socket.

pub use super::update_failure::{DownloadEvent, DownloadFailure, DownloadFailureKind};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, RANGE};
use reqwest::{Client, StatusCode, Url};
use std::time::Duration;

/// Attempts per download: the first request plus three resumes.
pub const DOWNLOAD_ATTEMPTS: u32 = 4;

/// Backoff before resume attempt `attempt` (1-based, the retries only).
pub fn retry_delay(attempt: u32) -> Duration {
    Duration::from_secs(3u64.pow(attempt.saturating_sub(1)))
}

fn classify(err: &reqwest::Error) -> DownloadFailureKind {
    if err.is_connect() || err.is_timeout() || err.is_request() || err.is_body() || err.is_decode()
    {
        DownloadFailureKind::Network
    } else {
        DownloadFailureKind::Other
    }
}

fn failure(
    kind: DownloadFailureKind,
    message: String,
    received: usize,
    total: Option<u64>,
) -> DownloadFailure {
    DownloadFailure {
        kind,
        message,
        received: received as u64,
        total,
        attempts: 0,
    }
}

enum AttemptOutcome {
    Done,
    Retry(DownloadFailure),
}

/// Stream `url` into `buffer`, resuming from its current length. Emits
/// `Started` on a fresh (or restarted) body and `Progress` per chunk.
async fn attempt(
    client: &Client,
    url: &Url,
    headers: &HeaderMap,
    buffer: &mut Vec<u8>,
    total: &mut Option<u64>,
    on_event: &mut (dyn FnMut(DownloadEvent) + Send),
) -> Result<AttemptOutcome, DownloadFailure> {
    let mut request = client.get(url.clone()).headers(headers.clone());
    let resuming = !buffer.is_empty();
    if resuming {
        request = request.header(RANGE, format!("bytes={}-", buffer.len()));
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(err) => {
            return Ok(AttemptOutcome::Retry(failure(
                classify(&err),
                err.to_string(),
                buffer.len(),
                *total,
            )))
        }
    };
    match response.status() {
        StatusCode::PARTIAL_CONTENT if resuming => {}
        StatusCode::OK => {
            // A fresh body, or a server that ignored the range: start over.
            buffer.clear();
            *total = response.content_length();
            on_event(DownloadEvent::Started {
                content_length: *total,
            });
        }
        status => {
            return Err(failure(
                DownloadFailureKind::Http,
                format!("Download request failed with status: {status}"),
                buffer.len(),
                *total,
            ))
        }
    }
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => {
                on_event(DownloadEvent::Progress {
                    chunk_length: chunk.len(),
                });
                buffer.extend_from_slice(&chunk);
            }
            Err(err) => {
                return Ok(AttemptOutcome::Retry(failure(
                    classify(&err),
                    err.to_string(),
                    buffer.len(),
                    *total,
                )))
            }
        }
    }
    if let Some(total) = *total {
        if (buffer.len() as u64) < total {
            // The server closed the stream early without an error frame.
            return Ok(AttemptOutcome::Retry(failure(
                DownloadFailureKind::Network,
                format!("stream ended at {} of {total} bytes", buffer.len()),
                buffer.len(),
                Some(total),
            )));
        }
    }
    Ok(AttemptOutcome::Done)
}

/// Download `url` in full, resuming across up to `DOWNLOAD_ATTEMPTS` tries.
/// A non-network failure (an HTTP status) is final on the first sight.
pub async fn fetch_with_resume(
    client: &Client,
    url: &Url,
    headers: &HeaderMap,
    mut on_event: impl FnMut(DownloadEvent) + Send,
) -> Result<Vec<u8>, DownloadFailure> {
    let mut buffer = Vec::new();
    let mut total = None;
    let mut last: Option<DownloadFailure> = None;
    for attempt_no in 1..=DOWNLOAD_ATTEMPTS {
        if attempt_no > 1 {
            tokio::time::sleep(retry_delay(attempt_no - 1)).await;
        }
        match attempt(client, url, headers, &mut buffer, &mut total, &mut on_event).await? {
            AttemptOutcome::Done => {
                on_event(DownloadEvent::Finished);
                return Ok(buffer);
            }
            AttemptOutcome::Retry(mut failure) => {
                failure.attempts = attempt_no;
                tracing::warn!(
                    "[updater] download attempt {attempt_no}/{DOWNLOAD_ATTEMPTS} stopped at {}/{} bytes: {}",
                    failure.received,
                    failure.total.map_or("?".to_string(), |t| t.to_string()),
                    failure.message
                );
                if failure.kind != DownloadFailureKind::Network {
                    return Err(failure);
                }
                last = Some(failure);
            }
        }
    }
    Err(last.unwrap_or_else(|| DownloadFailure::other("download made no attempt")))
}

#[cfg(test)]
#[path = "update_fetch_tests.rs"]
mod tests;
