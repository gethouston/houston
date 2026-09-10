//! The shell's own download + install commands over the updater plugin's
//! `Update` resource (PRODUCT-1727). `check()` stays with the plugin; the
//! download runs through `update_fetch` (resume + backoff, which the plugin's
//! single-shot request lacks), the bytes are verified against the release
//! signature exactly as the plugin would, then staged in the resource table
//! until the frontend asks for the install.

use super::update_failure::{DownloadFailure, DownloadFailureKind};
use super::update_fetch::{fetch_with_resume, DownloadEvent};
use minisign_verify::{PublicKey, Signature};
use reqwest::header::{HeaderValue, ACCEPT};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{Manager, Resource, ResourceId, Runtime, Webview};
use tauri_plugin_updater::Update;

/// A silent stall reads as a failure after this long, so it can be resumed
/// instead of hanging the download for the rest of the session.
const READ_TIMEOUT: Duration = Duration::from_secs(60);

/// The verified release bytes, waiting for `install_update`.
struct StagedUpdate(Vec<u8>);
impl Resource for StagedUpdate {}

fn client_for(update: &Update) -> Result<reqwest::Client, DownloadFailure> {
    let mut builder = reqwest::Client::builder()
        .user_agent(format!("houston-app/{}", env!("CARGO_PKG_VERSION")))
        .read_timeout(READ_TIMEOUT);
    if let Some(timeout) = update.timeout {
        builder = builder.timeout(timeout);
    }
    if update.no_proxy {
        builder = builder.no_proxy();
    } else if let Some(ref proxy) = update.proxy {
        let proxy = reqwest::Proxy::all(proxy.as_str())
            .map_err(|e| DownloadFailure::other(format!("invalid updater proxy: {e}")))?;
        builder = builder.proxy(proxy);
    }
    builder
        .build()
        .map_err(|e| DownloadFailure::other(format!("build download client: {e}")))
}

/// The plugin's minisign check, on the same pubkey it reads from
/// `tauri.conf.json` (`plugins.updater.pubkey`).
fn verify_signature(data: &[u8], release_signature: &str, pubkey_b64: &str) -> Result<(), String> {
    use base64::Engine;
    let decode = |value: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(value)
            .map_err(|e| e.to_string())
            .and_then(|bytes| String::from_utf8(bytes).map_err(|e| e.to_string()))
    };
    let public_key = PublicKey::decode(&decode(pubkey_b64)?).map_err(|e| e.to_string())?;
    let signature = Signature::decode(&decode(release_signature)?).map_err(|e| e.to_string())?;
    public_key
        .verify(data, &signature, true)
        .map_err(|e| e.to_string())
}

fn updater_pubkey<R: Runtime>(webview: &Webview<R>) -> Result<String, DownloadFailure> {
    webview
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|cfg| cfg.get("pubkey"))
        .and_then(|key| key.as_str())
        .map(str::to_string)
        .ok_or_else(|| DownloadFailure::other("updater pubkey missing from tauri.conf.json"))
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
/// resource), resuming across drops, verify its signature, and stage the
/// bytes. Resolves with the staged resource id for `install_update`.
#[tauri::command(rename_all = "snake_case")]
pub async fn download_update<R: Runtime>(
    webview: Webview<R>,
    rid: ResourceId,
    on_event: Channel<DownloadEvent>,
) -> Result<ResourceId, DownloadFailure> {
    let update = take_update(&webview, rid)?;
    let pubkey = updater_pubkey(&webview)?;
    let client = client_for(&update)?;
    let mut headers = update.headers.clone();
    if !headers.contains_key(ACCEPT) {
        headers.insert(ACCEPT, HeaderValue::from_static("application/octet-stream"));
    }
    let bytes = fetch_with_resume(&client, &update.download_url, &headers, |event| {
        // Progress callback with no UI thread: a closed channel only means
        // the webview went away mid-download, and the result still returns.
        if let Err(e) = on_event.send(event) {
            tracing::warn!("[updater] progress channel closed: {e}");
        }
    })
    .await?;
    if let Err(message) = verify_signature(&bytes, &update.signature, &pubkey) {
        return Err(DownloadFailure {
            kind: DownloadFailureKind::Signature,
            message: format!("release signature did not verify: {message}"),
            received: bytes.len() as u64,
            total: Some(bytes.len() as u64),
            attempts: 0,
        });
    }
    Ok(webview.resources_table().add(StagedUpdate(bytes)))
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
    update.install(&staged.0).map_err(|e| e.to_string())?;
    // Windows never reaches here (the installer hand-off exits the process);
    // on macOS the bytes are on disk now and the buffer can go.
    webview
        .resources_table()
        .close(bytes_rid)
        .map_err(|e| format!("release staged buffer: {e}"))
}

#[cfg(test)]
mod tests {
    use super::verify_signature;

    const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDJDQTdCMzc1MURERDRFQkQKUldTOVR0MGRkYk9uTEE4SUNnNElWZzVEN3QvcFQzczl6Y2NTMUpLSXJYZkxyK2g5azk4UHpRdmcK";

    #[test]
    fn rejects_a_signature_that_does_not_verify() {
        // Minisign-shaped text that is not a signature over these bytes.
        let signature = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            "untrusted comment: signature from tauri secret key\nRUS9Tt0ddbOnLNz8OJ/uxxZ7Z2XCvOfOPq+3pf+F4v2tGZJ5EbFqGhRp1yfy/LjrnNmnQ/4DUfL1x6jOSK2E1c1aILtmv0BYWQY=\ntrusted comment: timestamp:1\nO/A8d4Gk1e3G4pVUQFLHwQ4YwjQ8G9x8qz6uJ3+2OMZbjqPjVtKk8jsY0Y3tmBh8gQ7hFbHDd6i5a4Jj+8XCDQ==\n",
        );
        assert!(verify_signature(b"not the release", &signature, PUBKEY).is_err());
    }

    #[test]
    fn rejects_a_signature_that_is_not_minisign() {
        let signature =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, "garbage");
        assert!(verify_signature(b"bytes", &signature, PUBKEY).is_err());
    }
}
