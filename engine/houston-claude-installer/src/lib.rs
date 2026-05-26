//! Runtime installer for Anthropic's Claude Code CLI.
//!
//! Why a runtime installer instead of bundling like codex/composio?
//! Claude Code is shipped under a proprietary license that doesn't
//! permit redistribution inside Houston's bundle. So we do the next
//! best thing for non-technical users: detect the missing CLI on first
//! launch and download it for them, no terminal required.
//!
//! Why not just run `curl https://claude.ai/install.sh | bash`?
//!   1. **Reproducibility** — we pin a specific version + SHA-256 in
//!      `cli-deps.json` (bundled inside the .app via
//!      `houston-cli-bundle`). The upstream install script chases
//!      "latest", which would silently roll a new version on every
//!      Houston install and break the version lockstep we use to
//!      validate compatibility.
//!   2. **Verifiability** — every byte of the downloaded binary is
//!      checksum-verified before it's marked executable. The .app is
//!      signed/notarized; the manifest inside is tamper-evident; this
//!      installer extends that trust chain to the runtime download.
//!   3. **No bash dep** — we don't want to require `/bin/bash` at
//!      install time on every user's machine.
//!   4. **Progress events** — the installer emits `HoustonEvent`s so
//!      the UI shows real progress instead of a frozen splash.
//!
//! ## Install flow
//!
//! 1. Resolve manifest: prefer the bundled `cli-deps.json`, fall back
//!    to a same-shape JSON at the dev-checkout repo root.
//! 2. Look up the `claude-code` entry. Bail early if `bundled: true`
//!    (defensive — bundling claude-code would need a license change).
//! 3. Fetch the per-platform URL + checksum (`darwin-arm64`,
//!    `darwin-x64`, …) and download to a temp file alongside the final
//!    install target so the rename at the end is atomic on the same
//!    filesystem.
//! 4. Stream the response, accumulating SHA-256 as bytes arrive. Emit
//!    `HoustonEvent::ClaudeCliInstalling { progress_pct }` every ~250 ms.
//! 5. On EOF, compare the digest to the pinned checksum. Mismatch =>
//!    delete the temp file, return error (treated as fatal by the
//!    lifecycle entry).
//! 6. Mark executable (Unix), atomically rename into place, persist the
//!    installed version in the engine DB so the next boot can decide
//!    whether to re-install.

use futures_util::StreamExt;
use houston_db::db::Database;
use houston_ui_events::{ClaudeInstallError, DynEventSink, HoustonEvent};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

// Path-resolution functions live in `houston-terminal-manager` so the
// spawn-side code (`claude_path`, `claude_runner`) shares one source of
// truth with the install-side code below. Re-exported here for callers
// that import from this crate (e.g. `routes/claude.rs`,
// `provider/resolve.rs`).
pub use houston_terminal_manager::claude_install_path::{
    binary_name, cli_path, install_dir, is_installed,
};

/// Engine-DB preferences key holding the last successfully-installed
/// claude-code version. Lifecycle compares it against the manifest's
/// pinned version on every boot.
pub const PREF_INSTALLED_VERSION: &str = "claude_code_installed_version";

/// Engine-DB preferences key holding the most recent install failure
/// (empty string = no error). Read by `/v1/claude/status` so the
/// onboarding UI can show a clear reason next to the disabled "Sign in
/// with Anthropic" button instead of the misleading "install it
/// yourself" hint that fires for every other `cli_installed=false`
/// case.
pub const PREF_LAST_INSTALL_ERROR: &str = "claude_code_last_install_error";

/// CLI key inside `cli-deps.json`. Constant so we don't string-literal
/// the same value across modules.
const CLI_KEY: &str = "claude-code";

/// Lifecycle entry — call once at engine startup as a background task.
///
/// Decision tree:
/// - No manifest available → log + emit `ClaudeCliReady` (best-effort,
///   user can install manually or use Codex). The engine never blocks
///   on claude install: the user might be on Codex.
/// - Already installed at the pinned version → emit `ClaudeCliReady`.
/// - Not installed, or installed at a different version →
///   download/verify/install, then emit `ClaudeCliReady`.
/// - Download/verify failure → emit `ClaudeCliFailed { error }` with a
///   typed, localizable reason.
pub async fn ensure_and_upgrade(sink: DynEventSink, db: Database) {
    // Resolve the manifest. In dev (no bundle), we fall back to the
    // checkout's `cli-deps.json` so engineers get the same auto-install
    // behavior they'd hit in a packaged release. Production always finds
    // the bundled copy.
    let Some(manifest) = resolve_manifest() else {
        tracing::warn!(
            "[claude-installer] no cli-deps.json available — skipping auto-install"
        );
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    };

    let Some(entry) = manifest.entry(CLI_KEY) else {
        tracing::warn!(
            "[claude-installer] cli-deps.json missing '{}' entry — skipping auto-install",
            CLI_KEY
        );
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    };

    if entry.bundled {
        // Defensive — shouldn't be possible without a license change.
        // Treat the bundled binary as authoritative if it's there.
        tracing::info!("[claude-installer] manifest reports claude-code as bundled; trusting bundle");
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    }

    let pinned_version = entry.version.clone();

    // Already installed at the pinned version? Skip the download.
    let last_version = db
        .get_preference(PREF_INSTALLED_VERSION)
        .await
        .ok()
        .flatten()
        .unwrap_or_default();

    if is_installed() && last_version == pinned_version {
        tracing::info!(
            "[claude-installer] already at pinned version {}, skipping",
            pinned_version
        );
        sink.emit(HoustonEvent::ClaudeCliReady);
        return;
    }

    tracing::info!(
        "[claude-installer] installing claude-code v{} ({} → {})",
        pinned_version,
        if last_version.is_empty() { "none" } else { &last_version },
        pinned_version
    );

    sink.emit(HoustonEvent::ClaudeCliInstalling { progress_pct: 0 });

    let sink_for_progress = sink.clone();
    let result = install(&entry, move |pct| {
        sink_for_progress.emit(HoustonEvent::ClaudeCliInstalling { progress_pct: pct });
    })
    .await;

    finalize_install(&db, &pinned_version, &sink, result).await;
}

/// Persist the outcome of an install attempt and emit the matching
/// `ClaudeCliReady` / `ClaudeCliFailed` event. Shared between the
/// lifecycle entry above and the `POST /v1/claude/install` route handler
/// so both flows write the same DB markers and emit the same events.
pub async fn finalize_install(
    db: &Database,
    pinned_version: &str,
    sink: &DynEventSink,
    result: Result<PathBuf, ClaudeInstallError>,
) {
    match result {
        Ok(path) => {
            tracing::info!("[claude-installer] installed at {}", path.display());
            if let Err(e) = db.set_preference(PREF_INSTALLED_VERSION, pinned_version).await {
                tracing::warn!("[claude-installer] failed to persist version marker: {e}");
            }
            // Clear the last-error marker so the UI stops surfacing a
            // stale failure after a successful retry.
            if let Err(e) = db.set_preference(PREF_LAST_INSTALL_ERROR, "").await {
                tracing::warn!("[claude-installer] failed to clear last-error marker: {e}");
            }
            sink.emit(HoustonEvent::ClaudeCliReady);
        }
        Err(error) => {
            // English `Display` is for the engine log + bug-report
            // bundle only; the typed `kind` is what the UI localizes.
            tracing::error!("[claude-installer] install failed: {error}");
            if let Err(persist_err) = db
                .set_preference(PREF_LAST_INSTALL_ERROR, &error.to_pref_json())
                .await
            {
                tracing::warn!(
                    "[claude-installer] failed to persist last-error marker: {persist_err}"
                );
            }
            sink.emit(HoustonEvent::ClaudeCliFailed { error });
        }
    }
}

/// Resolve the pinned manifest, look up the `claude-code` entry, and run
/// the install for the host platform. Used by the `POST /v1/claude/install`
/// route so manifest / entry problems surface as a typed
/// [`ClaudeInstallError`] through the normal `ClaudeCliFailed` path
/// instead of a synchronous internal error the UI can't localize.
///
/// Returns the pinned version alongside the path on success so the
/// caller can write the installed-version marker via [`finalize_install`].
pub async fn install_pinned(
    progress: impl FnMut(u8) + Send + 'static,
) -> Result<(String, PathBuf), ClaudeInstallError> {
    let manifest = resolve_manifest().ok_or(ClaudeInstallError::ManifestMissing)?;
    let entry = manifest
        .entry(CLI_KEY)
        .ok_or(ClaudeInstallError::ManifestEntryMissing)?;
    let version = entry.version.clone();
    let path = install(&entry, progress).await?;
    Ok((version, path))
}

/// Resolve the `cli-deps.json` manifest. Prefers the bundled copy
/// (production) and falls back to the dev-checkout root so engineers
/// running `cargo run -p houston-engine-server` against an unbundled
/// build still get auto-install.
fn resolve_manifest() -> Option<houston_cli_bundle::CliDepsManifest> {
    if let Some(m) = houston_cli_bundle::load_bundled_manifest() {
        return Some(m);
    }
    // Dev fallback: walk up from CWD looking for `cli-deps.json`.
    let cwd = std::env::current_dir().ok()?;
    let mut here = cwd.as_path();
    loop {
        let candidate = here.join("cli-deps.json");
        if candidate.is_file() {
            return houston_cli_bundle::CliDepsManifest::load(&candidate).ok();
        }
        match here.parent() {
            Some(p) => here = p,
            None => return None,
        }
    }
}

/// Download + verify + install. Public so callers (e.g. an explicit
/// "Reinstall Claude" UI button) can re-run the same path without going
/// through the full lifecycle.
///
/// Writes to the production install location. Tests use [`install_to`]
/// directly to point at a temp dir.
pub async fn install(
    entry: &houston_cli_bundle::CliEntry,
    progress: impl FnMut(u8) + Send + 'static,
) -> Result<PathBuf, ClaudeInstallError> {
    install_to(entry, &install_dir(), binary_name(), progress).await
}

/// Parameterized variant of [`install`]: download `entry` for the
/// current host platform, verify SHA-256, write atomically into
/// `install_dir/binary_name`. Used by tests to redirect into a temp
/// directory; production callers should use [`install`].
pub async fn install_to(
    entry: &houston_cli_bundle::CliEntry,
    install_dir: &std::path::Path,
    binary_name: &str,
    mut progress: impl FnMut(u8) + Send + 'static,
) -> Result<PathBuf, ClaudeInstallError> {
    let platform = houston_cli_bundle::host_platform_key();
    let url = entry
        .url_for(platform)
        .ok_or_else(|| ClaudeInstallError::PlatformUnsupported {
            platform: platform.to_string(),
        })?;
    let expected_checksum = entry
        .checksum_for(platform)
        .ok_or_else(|| ClaudeInstallError::PlatformUnsupported {
            platform: platform.to_string(),
        })?
        .to_string();

    tracing::info!("[claude-installer] GET {url}");

    tokio::fs::create_dir_all(install_dir)
        .await
        .map_err(|e| ClaudeInstallError::WriteFailed {
            detail: format!("failed to create install dir {}: {e}", install_dir.display()),
        })?;

    let final_path = install_dir.join(binary_name);
    // Temp path on the same filesystem so the final rename is atomic
    // and we never leave a half-downloaded binary at the install
    // target if the process crashes mid-stream.
    let tmp_path = install_dir.join(format!(".{binary_name}.partial"));
    // Drop any leftover partial from a prior aborted install.
    let _ = tokio::fs::remove_file(&tmp_path).await;

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| ClaudeInstallError::Unknown {
            detail: format!("failed to build HTTP client: {e}"),
        })?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| classify_reqwest_error(&e))?;

    if !resp.status().is_success() {
        return Err(ClaudeInstallError::HttpError {
            status: resp.status().as_u16(),
        });
    }

    let total = resp.content_length();
    let mut stream = resp.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_pct_emitted: u8 = 0;

    let mut tmp_file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| ClaudeInstallError::WriteFailed {
            detail: format!("failed to open temp file {}: {e}", tmp_path.display()),
        })?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| classify_reqwest_error(&e))?;
        hasher.update(&chunk);
        tmp_file
            .write_all(&chunk)
            .await
            .map_err(|e| ClaudeInstallError::WriteFailed {
                detail: format!("failed to write chunk: {e}"),
            })?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        // Throttle progress events so we don't flood the WebSocket.
        // 10% increments are smooth enough for a ~120 MB download
        // without producing noise during the rest of engine boot.
        if let Some(total) = total {
            if total > 0 {
                let pct = ((downloaded.min(total) * 100) / total) as u8;
                if pct >= last_pct_emitted.saturating_add(10).min(100) {
                    last_pct_emitted = pct;
                    progress(pct);
                }
            }
        }
    }

    tmp_file
        .flush()
        .await
        .map_err(|e| ClaudeInstallError::WriteFailed {
            detail: format!("flush failed: {e}"),
        })?;
    drop(tmp_file);

    // Always emit a final 100% so the UI can transition out of
    // "installing" even when content-length was missing or we hit a
    // weird edge case in the throttle math above.
    progress(100);

    let actual_checksum = hex::encode(hasher.finalize());
    if !checksum_matches(&actual_checksum, &expected_checksum) {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        // The localized user copy comes from the `kind`; the expected /
        // actual digests ride along in `detail` for the bug report.
        return Err(ClaudeInstallError::ChecksumMismatch {
            detail: format!("checksum mismatch: expected {expected_checksum}, got {actual_checksum}"),
        });
    }

    // Make the binary executable BEFORE the rename so a racing reader
    // never sees a non-executable file at the install target.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&tmp_path, perms).map_err(|e| ClaudeInstallError::WriteFailed {
            detail: format!("failed to chmod +x: {e}"),
        })?;
    }

    // Atomic rename within the same dir. On Unix this is a syscall;
    // on Windows we have to remove the existing target first because
    // `rename` fails if the destination exists.
    #[cfg(windows)]
    {
        if final_path.exists() {
            let _ = std::fs::remove_file(&final_path);
        }
    }
    std::fs::rename(&tmp_path, &final_path).map_err(|e| ClaudeInstallError::WriteFailed {
        detail: format!(
            "failed to install to {}: {e} (check the directory is writable)",
            final_path.display()
        ),
    })?;

    Ok(final_path)
}

/// Hex string equality is case-insensitive in our manifest convention,
/// but we still want a constant-time-ish compare to avoid leaking
/// whether the prefix matched in profiling. Use `subtle`? Overkill for
/// a checksum compare in a desktop app — equality is fine, just be
/// explicit about case folding.
fn checksum_matches(actual: &str, expected: &str) -> bool {
    actual.eq_ignore_ascii_case(expected)
}

/// Translate a `reqwest::Error` into a message a non-technical user can
/// act on. The default `Display` impl produces chains like
/// `error sending request for url (...): error trying to connect:
/// dns error: failed to lookup address information`, which is the
/// "useless raw error" we surface in the onboarding card today and
/// which prompted issue #231.
///
/// Bias toward the network-down case — that's what real users hit
/// (laptop on a flaky cafe wifi, captive portal). The other branches
/// (HTTP 5xx, response body decode) get their own user-readable
/// wording.
fn classify_reqwest_error(err: &reqwest::Error) -> ClaudeInstallError {
    if err.is_timeout() {
        return ClaudeInstallError::Timeout;
    }
    if err.is_connect() {
        return ClaudeInstallError::NetworkUnreachable;
    }
    if err.is_body() || err.is_decode() {
        return ClaudeInstallError::DownloadInterrupted;
    }
    if err.is_request() {
        // `is_request` catches the catch-all "request-level" failures
        // (DNS lookup failure at the resolver layer, TLS handshake
        // failure, etc.) that don't surface through the more specific
        // predicates above. From the user's perspective these all mean
        // "the network didn't cooperate", so collapse to the same kind.
        return ClaudeInstallError::NetworkUnreachable;
    }
    // Unknown shape — keep the technical detail so bug reports stay
    // actionable.
    ClaudeInstallError::Unknown {
        detail: err.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Arc;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn checksum_match_ignores_case() {
        assert!(checksum_matches("DEADBEEF", "deadbeef"));
        assert!(checksum_matches("abc123", "abc123"));
        assert!(!checksum_matches("abc", "abd"));
    }

    #[test]
    fn cli_path_is_under_install_dir() {
        let cli = cli_path();
        let dir = install_dir();
        assert!(cli.starts_with(&dir), "{} not under {}", cli.display(), dir.display());
    }

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
        let detail = match err {
            ClaudeInstallError::ChecksumMismatch { detail } => detail,
            other => panic!("expected ChecksumMismatch, got {other:?}"),
        };
        assert!(
            detail.contains("checksum mismatch"),
            "detail must keep the technical digests for the bug report: {detail}"
        );
        // Both the partial and the final must be absent — we never want
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
        assert_eq!(
            err,
            ClaudeInstallError::HttpError { status: 500 },
            "5xx must classify as HttpError carrying the status code"
        );
    }

    /// Bad host = the realistic "no internet" scenario. Reqwest can't
    /// resolve `nonexistent-host-for-houston-test.invalid` so the
    /// failure surfaces through `is_request()` / `is_connect()`. Issue
    /// #231: this used to dump the raw error chain at the user; verify
    /// we collapse it to a one-line actionable message instead.
    #[tokio::test]
    async fn install_surfaces_network_failure_with_actionable_message() {
        let manifest = serde_json::json!({
            "claude-code": {
                "version": "9.9.9",
                "bundled": false,
                "binary_name": "claude",
                "urls": {
                    houston_cli_bundle::host_platform_key():
                        "http://nonexistent-host-for-houston-test.invalid/claude"
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

        let err = result.expect_err("bad host must error");
        // A DNS/connect failure used to dump the raw reqwest chain at the
        // user (issue #231). It must now collapse to the typed
        // NetworkUnreachable kind so the frontend can localize it — no
        // English prose, no leaked transport chain.
        assert_eq!(
            err,
            ClaudeInstallError::NetworkUnreachable,
            "DNS/connect failure must classify as NetworkUnreachable"
        );
    }

    #[tokio::test]
    async fn install_surfaces_stream_interruption() {
        // A genuinely truncated download: the server declares a 1 KB body
        // in Content-Length but writes a handful of bytes and slams the
        // socket shut, so reqwest fails mid-stream with a body/decode
        // error. Without classify_reqwest_error the user would see the raw
        // `hyper::Error(IncompleteMessage)` chain (issue #231).
        //
        // wiremock can't express this — it recomputes Content-Length from
        // the body, so a hand-rolled one-shot TCP server is the only way
        // to put a header/body length mismatch on the wire.
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                // Drain the request head enough to start replying; the
                // exact bytes don't matter, only that we then send a
                // short, truncated response body.
                let mut buf = [0u8; 1024];
                let _ = socket.read(&mut buf).await;
                let _ = socket
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1024\r\n\r\nshort")
                    .await;
                // Dropping `socket` here closes the connection mid-body.
            }
        });

        let entry = entry_for(&format!("http://{addr}"), b"unused");
        let dest_dir = tempfile::tempdir().unwrap();
        let result = install_to(&entry, dest_dir.path(), "claude", |_| {}).await;

        let err = result.expect_err("a truncated download must error");
        // The connection succeeded — only the body was cut — so this must
        // collapse to the typed DownloadInterrupted kind, never the raw
        // hyper chain and never NetworkUnreachable.
        assert_eq!(
            err,
            ClaudeInstallError::DownloadInterrupted,
            "truncated stream must classify as DownloadInterrupted, got {err:?}"
        );
    }

    #[test]
    fn error_kinds_serialize_with_snake_case_discriminant() {
        // The wire contract the TS union mirrors: a `kind` discriminant
        // in snake_case, per-variant fields alongside.
        assert_eq!(
            serde_json::to_string(&ClaudeInstallError::NetworkUnreachable).unwrap(),
            r#"{"kind":"network_unreachable"}"#
        );
        assert_eq!(
            serde_json::to_string(&ClaudeInstallError::HttpError { status: 503 }).unwrap(),
            r#"{"kind":"http_error","status":503}"#
        );
        // The preference JSON form the status route reads back must
        // round-trip losslessly.
        let original = ClaudeInstallError::ChecksumMismatch {
            detail: "expected a, got b".into(),
        };
        let restored: ClaudeInstallError =
            serde_json::from_str(&original.to_pref_json()).unwrap();
        assert_eq!(restored, original);
    }
}
