//! Download + verify + atomic-install for the Claude Code CLI.
//!
//! Extracted from `lib.rs` to keep the lifecycle entry under the 200-line
//! file cap. The split is by responsibility: this module owns "fetch and
//! land a binary on disk"; `lib.rs` owns "decide whether to call us and
//! what to do with the outcome".
//!
//! Public API is intentionally narrow:
//!   - [`install`] — production callers. Writes to the real install dir.
//!   - [`install_to`] — same logic, but parameterized on `install_dir` +
//!     `binary_name` so tests can redirect into a `tempdir`.
//!
//! Both are re-exported from `lib.rs` so existing callers (the lifecycle
//! entry, `routes/claude.rs`, `provider/resolve.rs`) don't notice the
//! move.

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

use houston_terminal_manager::claude_install_path::{binary_name, install_dir};

use crate::error::{checksum_matches, install_err};
use crate::finalize::chmod_and_atomic_rename;

/// Download + verify + install. Public so callers (e.g. an explicit
/// "Reinstall Claude" UI button) can re-run the same path without going
/// through the full lifecycle.
///
/// Writes to the production install location. Tests use [`install_to`]
/// directly to point at a temp dir.
pub async fn install(
    entry: &houston_cli_bundle::CliEntry,
    progress: impl FnMut(u8) + Send + 'static,
) -> Result<PathBuf, String> {
    install_to(entry, &install_dir(), binary_name(), progress).await
}

/// Parameterized variant of [`install`]: download `entry` for the
/// current host platform, verify SHA-256, write atomically into
/// `install_dir/binary_name`. Used by tests to redirect into a temp
/// directory; production callers should use [`install`].
///
/// On failure the returned `String` always carries (where known) the
/// pinned version, install_target path, URL, HTTP status code or SHA
/// mismatch hex, and the underlying OS error. CLAUDE.md "No silent
/// failures" surfaces this verbatim as the user's toast.
pub async fn install_to(
    entry: &houston_cli_bundle::CliEntry,
    install_dir: &std::path::Path,
    binary_name: &str,
    mut progress: impl FnMut(u8) + Send + 'static,
) -> Result<PathBuf, String> {
    let platform = houston_cli_bundle::host_platform_key();
    let version = entry.version.as_str();
    let final_path = install_dir.join(binary_name);
    let target_display = final_path.display().to_string();

    let url = entry.url_for(platform).ok_or_else(|| {
        format!(
            "claude-code v{version}: no download URL for platform '{platform}', \
             target \"{target_display}\""
        )
    })?;
    let expected_checksum = entry
        .checksum_for(platform)
        .ok_or_else(|| {
            format!(
                "claude-code v{version}: no checksum for platform '{platform}', \
                 target \"{target_display}\""
            )
        })?
        .to_string();

    tracing::info!("[claude-installer] GET {url}");

    tokio::fs::create_dir_all(install_dir).await.map_err(|e| {
        install_err("create install dir", version, &url, &target_display, None, &e)
    })?;

    // Temp path on the same filesystem so the final rename is atomic
    // and we never leave a half-downloaded binary at the install
    // target if the process crashes mid-stream.
    let tmp_path = install_dir.join(format!(".{binary_name}.partial"));
    // allow-silent-failure: cleanup of a stale partial from a prior
    // aborted install. The success state is "no partial on disk", so
    // an `Err(NotFound)` is already the post-condition we want; any
    // other error will resurface in the immediately-following
    // `File::create(&tmp_path)` with full context.
    let _ = tokio::fs::remove_file(&tmp_path).await;

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| {
            install_err("build HTTP client", version, &url, &target_display, None, &e)
        })?;

    let resp = client.get(&url).send().await.map_err(|e| {
        install_err("send download request", version, &url, &target_display, None, &e)
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        // Route the HTTP-status path through the same helper as every
        // other fatal so the user toast format stays consistent. The
        // helper formats `status` into the message; we synthesize a
        // dummy `err` because reqwest doesn't expose one for "got a
        // response but it wasn't 2xx".
        return Err(install_err(
            "download returned non-success status",
            version,
            &url,
            &target_display,
            Some(status),
            &"upstream rejected request",
        ));
    }

    let total = resp.content_length();
    let mut stream = resp.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_pct_emitted: u8 = 0;

    let mut tmp_file = tokio::fs::File::create(&tmp_path).await.map_err(|e| {
        install_err(
            &format!("open temp file {}", tmp_path.display()),
            version,
            &url,
            &target_display,
            None,
            &e,
        )
    })?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            install_err("read download stream", version, &url, &target_display, None, &e)
        })?;
        hasher.update(&chunk);
        tmp_file.write_all(&chunk).await.map_err(|e| {
            install_err("write download chunk", version, &url, &target_display, None, &e)
        })?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        // Throttle progress events so we don't flood the WebSocket.
        // 10% increments are smooth enough for a ~120 MB download
        // without producing noise during the rest of engine boot.
        // `checked_div` guards against a degenerate `Content-Length: 0`.
        if let Some(total) = total {
            if let Some(pct_u64) = (downloaded.min(total) * 100).checked_div(total) {
                let pct = pct_u64 as u8;
                if pct >= last_pct_emitted.saturating_add(10).min(100) {
                    last_pct_emitted = pct;
                    progress(pct);
                }
            }
        }
    }

    tmp_file.flush().await.map_err(|e| {
        install_err("flush temp file", version, &url, &target_display, None, &e)
    })?;
    drop(tmp_file);

    // Always emit a final 100% so the UI can transition out of
    // "installing" even when content-length was missing or we hit a
    // weird edge case in the throttle math above.
    progress(100);

    let actual_checksum = hex::encode(hasher.finalize());
    if !checksum_matches(&actual_checksum, &expected_checksum) {
        // allow-silent-failure: cleanup MUST NOT shadow the verification
        // error we are about to return. If remove fails, the partial
        // sits at `.<binary>.partial` until the next install retry
        // overwrites it; the user never sees a tampered binary at the
        // install target because we never renamed it into place. The
        // verification error itself carries full context.
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(format!(
            "claude-code v{version}: checksum mismatch, \
             expected {expected_checksum}, got {actual_checksum}, \
             source {url}, target \"{target_display}\" \
             (download may be tampered or the pinned manifest is stale)"
        ));
    }

    chmod_and_atomic_rename(&tmp_path, &final_path, version, &url, &target_display)?;
    Ok(final_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Arc;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Build a `CliEntry` parsed from a JSON document whose URL points
    /// at the wiremock server and whose checksum reflects `payload`.
    /// Mirrors the shape of `cli-deps.json` so the test exercises the
    /// real deserialization path.
    fn entry_for(server_uri: &str, payload: &[u8]) -> houston_cli_bundle::CliEntry {
        let actual = hex::encode(sha2::Sha256::digest(payload));
        let manifest = serde_json::json!({
            "claude-code": {
                "version": "9.9.9",
                "bundled": false,
                "binary_name": "claude",
                "license": "PROPRIETARY",
                "urls": {
                    houston_cli_bundle::host_platform_key(): format!("{server_uri}/claude")
                },
                "checksums": {
                    houston_cli_bundle::host_platform_key(): actual
                }
            }
        });
        let raw = serde_json::to_string(&manifest).unwrap();
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), raw).unwrap();
        let m = houston_cli_bundle::CliDepsManifest::load(tmp.path()).unwrap();
        m.entry("claude-code").unwrap()
    }

    #[tokio::test]
    async fn install_downloads_verifies_and_chmods() {
        let server = MockServer::start().await;
        let payload = b"#!/bin/sh\necho 'fake claude'\n".repeat(50_000); // ~1.5 MB

        Mock::given(method("GET"))
            .and(path("/claude"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/octet-stream")
                    .set_body_bytes(payload.clone()),
            )
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), &payload);
        let dest_dir = tempfile::tempdir().unwrap();
        let progress = Arc::new(AtomicU8::new(0));
        let progress_clone = progress.clone();

        let result = install_to(&entry, dest_dir.path(), "claude", move |pct| {
            progress_clone.store(pct, Ordering::Relaxed);
        })
        .await;

        let installed = result.expect("install should succeed");
        assert_eq!(installed, dest_dir.path().join("claude"));
        assert_eq!(std::fs::read(&installed).unwrap(), payload);
        assert_eq!(progress.load(Ordering::Relaxed), 100);

        // Temp file must be cleaned up after atomic rename.
        let tmp = dest_dir.path().join(".claude.partial");
        assert!(!tmp.exists(), "leftover partial at {}", tmp.display());

        // Unix: chmod +x must be set so the binary can be exec'd.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&installed).unwrap().permissions().mode();
            assert!(
                mode & 0o111 != 0,
                "binary not executable (mode={mode:o}): {}",
                installed.display()
            );
        }
    }

    #[tokio::test]
    async fn install_rejects_checksum_mismatch_and_cleans_temp() {
        let server = MockServer::start().await;
        let payload = b"corrupt payload";

        Mock::given(method("GET"))
            .and(path("/claude"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload.to_vec()))
            .mount(&server)
            .await;

        // Build entry with a fake checksum that won't match the actual.
        let manifest = serde_json::json!({
            "claude-code": {
                "version": "9.9.9",
                "bundled": false,
                "binary_name": "claude",
                "urls": {
                    houston_cli_bundle::host_platform_key(): format!("{}/claude", server.uri())
                },
                "checksums": {
                    houston_cli_bundle::host_platform_key():
                        "0000000000000000000000000000000000000000000000000000000000000000"
                }
            }
        });
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), serde_json::to_string(&manifest).unwrap()).unwrap();
        let entry = houston_cli_bundle::CliDepsManifest::load(tmp.path())
            .unwrap()
            .entry("claude-code")
            .unwrap();

        let dest_dir = tempfile::tempdir().unwrap();
        let result = install_to(&entry, dest_dir.path(), "claude", |_| {}).await;

        let err = result.expect_err("checksum mismatch must error");
        // Verify the error carries every field the user needs to act:
        // pinned version, both checksums in hex, source URL, target
        // path. CLAUDE.md §"No silent failures" requires this richness.
        assert!(err.contains("checksum mismatch"), "missing kind: {err}");
        assert!(err.contains("v9.9.9"), "missing pinned version: {err}");
        assert!(
            err.contains("0000000000000000000000000000000000000000000000000000000000000000"),
            "missing pinned (expected) checksum: {err}"
        );
        assert!(err.contains(&server.uri()), "missing source URL: {err}");
        assert!(
            err.contains(&dest_dir.path().join("claude").display().to_string()),
            "missing install target: {err}"
        );
        // Both the partial and the final must be absent: we never want
        // a tampered binary on disk after a verification failure.
        assert!(!dest_dir.path().join("claude").exists());
        assert!(!dest_dir.path().join(".claude.partial").exists());
    }

    #[tokio::test]
    async fn install_surfaces_http_errors() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/claude"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), b"unused");
        let dest_dir = tempfile::tempdir().unwrap();
        let result = install_to(&entry, dest_dir.path(), "claude", |_| {}).await;

        let err = result.expect_err("server 500 must error");
        assert!(
            err.contains("HTTP") || err.contains("500"),
            "unexpected error: {err}"
        );
    }

    /// Regression for #231: when the download URL returns 404 (the
    /// canonical "release was retracted / version typo / CDN drift"
    /// failure), the surfaced error must carry enough context for the
    /// user to act: the pinned version (so they can search release
    /// notes), the URL (so they can `curl` it by hand), the HTTP
    /// status code (so they know it's an availability issue and not
    /// auth/firewall), and the install_target (so support can ask
    /// "ls -ld <dir>" without a second round-trip).
    #[tokio::test]
    async fn install_surfaces_404_with_url_and_status() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/claude"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), b"unused");
        let dest_dir = tempfile::tempdir().unwrap();
        let result = install_to(&entry, dest_dir.path(), "claude", |_| {}).await;

        let err = result.expect_err("server 404 must error");
        // 1. HTTP status code is present so the user sees "404", not a
        //    generic "download failed".
        assert!(err.contains("404"), "missing HTTP status: {err}");
        // 2. The pinned version threads from cli-deps.json all the way
        //    to the toast — confirms the `version` field is wired into
        //    the error formatter for the HTTP-failure path specifically
        //    (not just checksum mismatch).
        assert!(err.contains("v9.9.9"), "missing pinned version: {err}");
        // 3. The full URL the user can re-run by hand. Using the mock
        //    server's URI guarantees we're asserting on the actual
        //    request target, not a hard-coded literal.
        let expected_url = format!("{}/claude", server.uri());
        assert!(
            err.contains(&expected_url),
            "missing download URL ({expected_url}): {err}"
        );
        // 4. The install_target path so the user can verify ownership /
        //    available space without us asking.
        let expected_target = dest_dir.path().join("claude").display().to_string();
        assert!(
            err.contains(&expected_target),
            "missing install target ({expected_target}): {err}"
        );
        // 5. No em dashes: the surfacing chain renders this verbatim as
        //    a user-facing toast and CLAUDE.md bans em dashes in user
        //    copy. Use commas/colons (which we do).
        assert!(
            !err.contains('\u{2014}'),
            "em dash leaked into user-facing error: {err}"
        );
        // 6. No temp file left behind: a 404 must not leave a phantom
        //    `.claude.partial` at the target. We never opened the temp
        //    file because the status check fired before file creation.
        assert!(!dest_dir.path().join(".claude.partial").exists());
        assert!(!dest_dir.path().join("claude").exists());
    }

    /// P1-2 regression: every fatal install path — including HTTP
    /// non-success — routes through `install_err` and produces the
    /// same shape ("claude-code v{version}: {stage}..., source ...,
    /// target ..."). Future drift between the HTTP site and the
    /// other 12 sites would re-introduce the inconsistency the
    /// cross-reviewer flagged. Asserts on the shape, not the exact
    /// text, so wording can evolve without breaking the test.
    #[tokio::test]
    async fn install_err_format_is_consistent_across_paths() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/claude"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), b"unused");
        let dest_dir = tempfile::tempdir().unwrap();
        let err = install_to(&entry, dest_dir.path(), "claude", |_| {})
            .await
            .expect_err("404 must error");

        // Shape signature: every fatal carries "claude-code v...",
        // "source <url>", and "target \"<path>\"". The HTTP site now
        // also carries "(HTTP 404)" via the optional status param.
        assert!(err.starts_with("claude-code v"), "missing prefix: {err}");
        assert!(err.contains("source "), "missing source clause: {err}");
        assert!(err.contains("target \""), "missing target clause: {err}");
        assert!(err.contains("(HTTP 404"), "missing status clause: {err}");
    }
}
