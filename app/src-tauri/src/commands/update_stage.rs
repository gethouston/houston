//! The shell's own download + install commands over the updater plugin's
//! `Update` resource (PRODUCT-1727). `check()` stays with the plugin; the
//! download runs through `update_fetch` into a persisted partial under the
//! app cache dir (resume + backoff within a call AND across calls, which the
//! plugin's single-shot request lacks), the finished file is verified against
//! the release signature exactly as the plugin would (`update_verify`), then
//! staged in the resource table until the frontend asks for the install.
//! One download per release runs at a time; a second call joins it
//! (`update_staged`).

use super::update_client::{client_for, updater_pubkey};
use super::update_failure::DownloadFailure;
use super::update_fetch::{attempt_budget, fetch_with_resume, DownloadEvent};
use super::update_partial::{OpenError, PartialDownload};
use super::update_partial_dir::prune_abandoned;
use super::update_staged::STAGED;
use super::update_verify::admit_release;
use reqwest::header::{HeaderValue, ACCEPT};
use std::path::PathBuf;
use std::time::SystemTime;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Resource, ResourceId, Runtime, Webview};
use tauri_plugin_updater::Update;

const PARTIALS_DIR: &str = "updates";

/// Names the verified release bytes waiting for `install_update`. The bytes
/// stay in `STAGED`: every call for a release gets a handle of its own, and
/// a handle that held the bytes would keep 330 MB alive past the install.
struct StagedUpdate {
    version: String,
    signature: String,
}
impl Resource for StagedUpdate {}

/// `<app cache dir>/updates`: where a half-downloaded release waits for the
/// next poll. A cache dir on purpose: the OS may purge it, and a purge only
/// costs a restart from zero. When it cannot be resolved or created the
/// download falls back to the system temp dir rather than not running.
fn partials_dir<R: Runtime>(app: &impl Manager<R>) -> PathBuf {
    let preferred = app.path().app_cache_dir().map(|dir| dir.join(PARTIALS_DIR));
    match preferred.and_then(|dir| {
        std::fs::create_dir_all(&dir)
            .map(|()| dir)
            .map_err(Into::into)
    }) {
        Ok(dir) => dir,
        Err(e) => {
            tracing::warn!("[updater] app cache dir unavailable, using temp dir: {e}");
            std::env::temp_dir().join("houston").join(PARTIALS_DIR)
        }
    }
}

/// Startup sweep of partials no poll will finish: the running version's own
/// (it installed some other way) and anything untouched for a week.
pub fn prune_abandoned_partials(app: &AppHandle) {
    let dir = partials_dir(app);
    prune_abandoned(&dir, env!("CARGO_PKG_VERSION"), SystemTime::now());
}

fn take_update<R: Runtime>(
    webview: &Webview<R>,
    rid: ResourceId,
) -> Result<Update, DownloadFailure> {
    let update = webview
        .resources_table()
        .get::<Update>(rid)
        .map_err(|e| DownloadFailure::other(format!("update resource {rid} is gone: {e}")))?;
    Ok((*update).clone())
}

/// Download the release the plugin's `check()` found (`rid` is its `Update`
/// resource), resuming across drops and across calls, verify its signature,
/// and stage the bytes. `attempts` is the caller's budget for this call
/// (clamped; the launch-time install asks for a short one). Resolves with the
/// staged resource id for `install_update`. A rejection for a dropped link
/// leaves the partial on disk; the next call picks it up where it stopped.
/// A call for a release another call is downloading waits for that one and
/// shares its outcome; it gets no progress events of its own.
#[tauri::command(rename_all = "snake_case")]
pub async fn download_update<R: Runtime>(
    webview: Webview<R>,
    rid: ResourceId,
    attempts: Option<u32>,
    on_event: Channel<DownloadEvent>,
) -> Result<ResourceId, DownloadFailure> {
    let update = take_update(&webview, rid)?;
    STAGED
        .admitted_or_fetch(&update.version, &update.signature, || {
            fetch_and_admit(&webview, &update, attempts, on_event)
        })
        .await?;
    Ok(webview.resources_table().add(StagedUpdate {
        version: update.version,
        signature: update.signature,
    }))
}

async fn fetch_and_admit<R: Runtime>(
    webview: &Webview<R>,
    update: &Update,
    attempts: Option<u32>,
    on_event: Channel<DownloadEvent>,
) -> Result<Vec<u8>, DownloadFailure> {
    let pubkey = updater_pubkey(webview)?;
    let client = client_for(update)?;
    let mut headers = update.headers.clone();
    if !headers.contains_key(ACCEPT) {
        headers.insert(ACCEPT, HeaderValue::from_static("application/octet-stream"));
    }
    let dir = partials_dir(webview);
    let mut partial =
        match PartialDownload::open(&dir, &update.version, update.download_url.as_str()) {
            Ok(partial) => partial,
            Err(OpenError::InProgress) => {
                return Err(DownloadFailure::in_progress(&update.version))
            }
            Err(OpenError::Io(e)) => return Err(DownloadFailure::io("open partial download", &e)),
        };
    fetch_with_resume(
        &client,
        &update.download_url,
        &headers,
        &mut partial,
        attempt_budget(attempts),
        |event| {
            if let Err(e) = on_event.send(event) {
                tracing::warn!("[updater] progress channel closed: {e}");
            }
        },
    )
    .await?;
    admit_release(partial, &update.signature, &pubkey).await
}

/// Install the staged bytes through the plugin's installer (bundle swap on
/// macOS; msiexec hand-off + process exit on Windows).
#[tauri::command(rename_all = "snake_case")]
pub async fn install_update<R: Runtime>(
    webview: Webview<R>,
    rid: ResourceId,
    bytes_rid: ResourceId,
) -> Result<(), String> {
    let update = take_update(&webview, rid).map_err(|e| e.message)?;
    let staged = webview
        .resources_table()
        .get::<StagedUpdate>(bytes_rid)
        .map_err(|e| format!("staged update {bytes_rid} is gone: {e}"))?;
    if staged.version != update.version {
        return Err(format!(
            "staged update {bytes_rid} holds {}, not {}",
            staged.version, update.version
        ));
    }
    let bytes = STAGED
        .admitted(&staged.version, &staged.signature)
        .ok_or_else(|| format!("staged bytes of {} are gone", staged.version))?;
    update
        .install(bytes.as_slice())
        .map_err(|e| e.to_string())?;
    STAGED.forget(&staged.version, &staged.signature);
    webview
        .resources_table()
        .close(bytes_rid)
        .map_err(|e| format!("release staged buffer: {e}"))
}
