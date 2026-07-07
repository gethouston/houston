//! The pinned dictation model: manifest, on-disk status, and a verified,
//! resumable-safe download.
//!
//! One model is shipped — whisper.cpp's `ggml-small-q5_1` (~181 MB). The
//! sha256 was taken from Hugging Face's file tree API (the LFS `oid`) WITHOUT
//! pulling the blob:
//!   `curl https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main`
//! and pinned below. The download streams to a `.part` sibling, hashing as it
//! goes, and only atomically renames into place after the digest matches — so a
//! truncated or corrupted fetch can never masquerade as a ready model.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use super::types::{DictationModelStatus, ModelProgress, ModelProgressPhase};
use super::verify::{hex, verify_and_finalize, PartGuard};
use futures_util::StreamExt;

/// Stable identifier the frontend uses to name the model.
pub const MODEL_ID: &str = "ggml-small-q5_1";
const FILE_NAME: &str = "ggml-small-q5_1.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin";
/// LFS oid from the HF tree API (see module docs).
const MODEL_SHA256: &str = "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb";
const MODEL_SIZE_BYTES: u64 = 190_085_487;

/// The progress event channel the frontend listens on.
const PROGRESS_EVENT: &str = "dictation-model-progress";

/// `<app_data_dir>/models/whisper/ggml-small-q5_1.bin`.
pub fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("dictation: resolve app data dir: {e}"))?;
    Ok(dir.join("models").join("whisper").join(FILE_NAME))
}

/// Ready = the file exists AND is exactly the expected size. A size check is a
/// cheap corruption guard that avoids re-hashing 181 MB on every status poll;
/// the full sha256 is enforced once, at download time.
fn is_ready(path: &Path) -> bool {
    matches!(std::fs::metadata(path), Ok(m) if m.len() == MODEL_SIZE_BYTES)
}

#[tauri::command]
pub async fn dictation_model_status(app: AppHandle) -> Result<DictationModelStatus, String> {
    let path = model_path(&app)?;
    Ok(DictationModelStatus {
        ready: is_ready(&path),
        model_id: MODEL_ID.to_string(),
        size_bytes: MODEL_SIZE_BYTES,
    })
}

#[tauri::command]
pub async fn download_dictation_model(app: AppHandle) -> Result<(), String> {
    let final_path = model_path(&app)?;
    // Idempotent: a ready model resolves immediately with a terminal Done tick.
    if is_ready(&final_path) {
        emit(
            &app,
            MODEL_SIZE_BYTES,
            MODEL_SIZE_BYTES,
            ModelProgressPhase::Done,
        );
        return Ok(());
    }
    match download_inner(&app, &final_path).await {
        Ok(()) => Ok(()),
        Err(e) => {
            // No-silent-failure: surface an Error tick AND propagate the Err so
            // the frontend can toast the real reason with a Report-bug button.
            emit(&app, 0, MODEL_SIZE_BYTES, ModelProgressPhase::Error);
            Err(e)
        }
    }
}

async fn download_inner(app: &AppHandle, final_path: &Path) -> Result<(), String> {
    let dir = final_path
        .parent()
        .ok_or_else(|| "dictation: model path has no parent".to_string())?;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("dictation: create model dir: {e}"))?;

    let part = final_path.with_extension("part");
    // Removes the partial file on any early return unless we disarm it on success.
    let guard = PartGuard::new(part.clone());

    let resp = reqwest::get(MODEL_URL)
        .await
        .map_err(|e| format!("dictation: request model: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("dictation: model download HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(MODEL_SIZE_BYTES);

    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| format!("dictation: create {}: {e}", part.display()))?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    emit(app, 0, total, ModelProgressPhase::Downloading);

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("dictation: read model stream: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("dictation: write {}: {e}", part.display()))?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        // Throttle to ~4 ticks/second so a 181 MB stream can't flood the webview.
        if last_emit.elapsed().as_millis() >= 250 {
            emit(app, received, total, ModelProgressPhase::Downloading);
            last_emit = std::time::Instant::now();
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("dictation: flush {}: {e}", part.display()))?;
    drop(file);

    emit(app, received, total, ModelProgressPhase::Verifying);
    let actual = hex(&hasher.finalize());
    verify_and_finalize(&part, final_path, &actual, MODEL_SHA256)?;

    guard.disarm();
    emit(app, total, total, ModelProgressPhase::Done);
    Ok(())
}

fn emit(app: &AppHandle, received: u64, total: u64, phase: ModelProgressPhase) {
    let payload = ModelProgress {
        received,
        total,
        phase,
    };
    // Event-emit callback: no UI thread to toast on here, so a failed emit is
    // logged (the documented exception to the no-silent-failure rule).
    if let Err(e) = app.emit(PROGRESS_EVENT, payload) {
        tracing::error!("[dictation] failed to emit progress event: {e}");
    }
}
