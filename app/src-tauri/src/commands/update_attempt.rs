//! One request of the resumable release download (`update_fetch`): resume
//! the persisted partial from its length with `Range` + `If-Range`, or fetch
//! a fresh body, and stream what comes back into the file. The loop around it
//! decides whether an outcome is retried; this module decides what the
//! server's answer means for the bytes already on disk.

use super::update_failure::{
    is_transient_status, DownloadEvent, DownloadFailure, DownloadFailureKind,
};
use super::update_partial::{PartialDownload, Sidecar};
use futures_util::StreamExt;
use reqwest::header::{
    HeaderMap, HeaderValue, CONTENT_RANGE, ETAG, IF_RANGE, LAST_MODIFIED, RANGE,
};
use reqwest::{Client, Response, StatusCode, Url};

/// What a later `If-Range` names: a strong `ETag`, else `Last-Modified`. A
/// weak ETag (`W/"..."`) cannot condition a range request and is skipped.
fn validator_of(headers: &HeaderMap) -> Option<String> {
    let etag = headers
        .get(ETAG)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.starts_with('"'));
    etag.or_else(|| headers.get(LAST_MODIFIED).and_then(|v| v.to_str().ok()))
        .map(str::to_string)
}

/// A 206's `Content-Range: bytes N-M/T`, as (first byte, total). The total
/// is `None` for the `*` form.
fn content_range(headers: &HeaderMap) -> Option<(u64, Option<u64>)> {
    let value = headers.get(CONTENT_RANGE)?.to_str().ok()?;
    let (range, total) = value.strip_prefix("bytes ")?.split_once('/')?;
    let start = range.split('-').next()?.trim().parse().ok()?;
    Some((start, total.trim().parse().ok()))
}

/// Why a 206 cannot be joined to the partial, or `None` when it can. GitHub's
/// release CDN answers 206 to ANY `If-Range` (observed live), so the
/// condition alone proves nothing: the answer must name the object the
/// sidecar does, start where the file ends, and agree on the total.
fn resume_mismatch(response: &Response, partial: &PartialDownload) -> Option<String> {
    let headers = response.headers();
    let offset = partial.len();
    let validator = validator_of(headers);
    if partial.validator().is_some() && validator.as_deref() != partial.validator() {
        return Some(format!(
            "server now serves {validator:?}, the partial is of {:?}",
            partial.validator()
        ));
    }
    match content_range(headers) {
        Some((start, _)) if start != offset => Some(format!(
            "server resumed at {start}, the partial ends at {offset}"
        )),
        Some((_, Some(total))) if partial.total().is_some_and(|known| known != total) => {
            Some(format!(
                "server total is {total}, the partial expects {:?}",
                partial.total()
            ))
        }
        None => Some("server answered 206 without a Content-Range".to_string()),
        _ => None,
    }
}

pub(super) enum AttemptOutcome {
    Done,
    Retry(DownloadFailure),
}

/// Reset the partial and ask the loop to start over: the server's answer
/// cannot be joined to the bytes on disk.
async fn restart_after(
    partial: &mut PartialDownload,
    status: StatusCode,
    message: String,
) -> Result<AttemptOutcome, DownloadFailure> {
    partial
        .restart(None)
        .await
        .map_err(|e| DownloadFailure::io("reset partial download", &e))?;
    Ok(AttemptOutcome::Retry(DownloadFailure::range_reset(
        status, message,
    )))
}

/// One request: resume `partial` from its length, or fetch a fresh body.
/// Emits `Started` on a fresh (or restarted) body and `Progress` per chunk.
pub(super) async fn attempt(
    client: &Client,
    url: &Url,
    headers: &HeaderMap,
    partial: &mut PartialDownload,
    on_event: &mut (dyn FnMut(DownloadEvent) + Send),
) -> Result<AttemptOutcome, DownloadFailure> {
    let offset = partial.len();
    let total = partial.total();
    if matches!(total, Some(total) if offset >= total) {
        return Ok(AttemptOutcome::Done);
    }
    let mut request = client.get(url.clone()).headers(headers.clone());
    let resuming = offset > 0;
    if resuming {
        request = request.header(RANGE, format!("bytes={offset}-"));
        if let Some(value) = partial
            .validator()
            .and_then(|v| HeaderValue::from_str(v).ok())
        {
            request = request.header(IF_RANGE, value);
        }
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(err) => {
            return Ok(AttemptOutcome::Retry(DownloadFailure::transport(
                &err, offset, total,
            )))
        }
    };
    let status = response.status();
    match status {
        StatusCode::PARTIAL_CONTENT if resuming => {
            if let Some(message) = resume_mismatch(&response, partial) {
                return restart_after(partial, status, message).await;
            }
        }
        StatusCode::RANGE_NOT_SATISFIABLE if resuming => {
            let message = format!("server has no byte {offset} to resume from");
            return restart_after(partial, status, message).await;
        }
        StatusCode::OK => {
            let sidecar = Sidecar {
                url: url.to_string(),
                validator: validator_of(response.headers()),
                total: response.content_length(),
            };
            partial
                .restart(Some(sidecar))
                .await
                .map_err(|e| DownloadFailure::io("restart partial download", &e))?;
            on_event(DownloadEvent::Started {
                content_length: partial.total(),
            });
        }
        status if is_transient_status(status) => {
            return Ok(AttemptOutcome::Retry(DownloadFailure::status(
                status, offset, total,
            )))
        }
        status => return Err(DownloadFailure::status(status, offset, total)),
    }
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(err) => {
                let failure = DownloadFailure::transport(&err, partial.len(), partial.total());
                return Ok(AttemptOutcome::Retry(failure));
            }
        };
        partial
            .append(&chunk)
            .await
            .map_err(|e| DownloadFailure::io("write partial download", &e))?;
        on_event(DownloadEvent::Progress {
            chunk_length: chunk.len(),
        });
    }
    if let Some(total) = partial.total() {
        if partial.len() < total {
            return Ok(AttemptOutcome::Retry(DownloadFailure::stopped(
                DownloadFailureKind::Network,
                format!("stream ended at {} of {total} bytes", partial.len()),
                partial.len(),
                Some(total),
            )));
        }
    }
    Ok(AttemptOutcome::Done)
}
