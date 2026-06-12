//! `houston-engine` binary entry point.
//!
//! Reads config from env, binds a TCP listener, writes `engine.json` to the
//! Houston home dir so the desktop supervisor can discover `{port, pid,
//! token_hash, version}`, and serves the full router.

use houston_engine_protocol::{ENGINE_VERSION, PROTOCOL_VERSION};
use houston_engine_server::{build_router, ServerConfig, ServerState};
use houston_tunnel::{EngineEndpoint, TunnelClient, TunnelConfig};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::io::{IsTerminal, Read};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

mod sentry_grouping;
mod sentry_scrub;

#[derive(Serialize)]
struct EngineManifest<'a> {
    version: &'a str,
    protocol: u8,
    port: u16,
    pid: u32,
    token_hash: String,
}

#[tokio::main]
async fn main() {
    // Sentry BEFORE tracing so the sentry_tracing layer wired into
    // `init_tracing` has a live client from the first log line, and the panic
    // handler is installed before any work runs. The guard is bound for the
    // whole process lifetime — dropping it stops the transport from flushing.
    // No-op (None) unless a SENTRY_DSN was injected (the desktop app does this
    // at spawn; forks/dev/self-hosters without one stay silent).
    let _sentry_guard = init_sentry();

    init_tracing();

    // Exit when the desktop app that owns us goes away, so we never become
    // an orphan engine holding a port (gethouston/houston#306).
    spawn_parent_watchdog();

    // PATH resolution runs `zsh -l -c 'echo $PATH'` + scans install dirs
    // (~0.5-2s). Previously we did it here synchronously, which blocked
    // the main thread until finished and delayed the `HOUSTON_ENGINE_LISTENING`
    // banner — so the Tauri supervisor saw a longer startup and the
    // "Starting Houston engine…" splash lingered. Kick it off on a
    // blocking thread so bind/banner happen immediately, then await the
    // result before `axum::serve` starts accepting so no route handler
    // can read an unresolved PATH.
    let path_init = tokio::task::spawn_blocking(|| {
        houston_terminal_manager::claude_path::init();
    });

    // Provision Git Bash on Windows in the background.
    //
    // Claude Code's claude.exe refuses to run without bash.exe, so on
    // first launch we extract the bundled PortableGit archive into
    // `%LOCALAPPDATA%\Programs\Houston\runtime\git-bash-<arch>\` and
    // export `CLAUDE_CODE_GIT_BASH_PATH` so every later child process
    // (provider auth probe, login flow, summarize call, chat-session
    // runner) inherits the path.
    //
    // This task is intentionally fire-and-forget: we do NOT await it
    // before `axum::serve`. First-launch extraction is CPU-bound
    // (~5-10s LZMA2 decode) and a Tauri supervisor with a tight
    // health-check timeout would otherwise kill the engine
    // mid-extract, leaving the user in a crash loop with no
    // PortableGit and no Houston. By the time a route handler that
    // actually needs bash runs, either the boot-time task has
    // already populated the env var or `find_git_bash_windows()` in
    // provider.rs calls `ensure_bundled_bash()` on-demand. Both
    // paths share a Mutex inside
    // `houston_engine_core::git_bash::ensure_bundled_bash`, so a
    // concurrent on-demand caller blocks on the same extraction the
    // boot task is performing instead of starting a second one.
    #[cfg(target_os = "windows")]
    tokio::task::spawn_blocking(|| {
        if let Some(bash) = houston_engine_core::git_bash::ensure_bundled_bash() {
            tracing::info!("[boot] CLAUDE_CODE_GIT_BASH_PATH={}", bash.display());
            // SAFETY: the cache mutex inside `ensure_bundled_bash`
            // guarantees only one writer at a time reaches this
            // line for the lifetime of the process. set_var's
            // `unsafe` marker exists to make readers-during-write
            // the caller's problem; serialization through the cache
            // is that contract.
            unsafe {
                std::env::set_var("CLAUDE_CODE_GIT_BASH_PATH", bash);
            }
        } else {
            tracing::warn!(
                "[boot] no bundled Git Bash found — Claude Code will fail until \
                 the user installs Git for Windows manually"
            );
        }
    });

    let cfg = ServerConfig::from_env();
    let listener = TcpListener::bind(cfg.bind).await.expect("bind failed");
    let actual: SocketAddr = listener.local_addr().expect("local_addr");

    write_manifest(&cfg, actual.port());

    // Emit the port on stdout so the desktop supervisor can parse it.
    // Must print BEFORE any potentially-slow work so the supervisor's
    // banner-wait timer doesn't race startup.
    println!(
        "HOUSTON_ENGINE_LISTENING port={} token={}",
        actual.port(),
        cfg.token
    );
    tracing::info!(
        "houston-engine {} (protocol v{}) listening on {}",
        ENGINE_VERSION,
        PROTOCOL_VERSION,
        actual
    );

    // Tunnel identity: cached in `<home>/tunnel.json`, or allocated on
    // first boot via `POST {relay}/allocate`. Failure is non-fatal — the
    // engine keeps serving local traffic; mobile companion + push stay
    // dormant until the next boot succeeds.
    let tunnel_identity = match houston_tunnel::ensure(&cfg.home_dir, &cfg.tunnel_url).await {
        Ok(identity) => {
            tracing::info!(
                target: "houston_tunnel",
                tunnel_id = %identity.tunnel_id,
                host = %identity.public_host,
                "tunnel identity loaded"
            );
            Some(identity)
        }
        Err(e) => {
            tracing::warn!(
                target: "houston_tunnel",
                error = %e,
                "tunnel allocation failed — running local-only, pairing disabled until next boot"
            );
            None
        }
    };

    let state = ServerState::new(cfg, tunnel_identity)
        .await
        .expect("engine state init failed");

    let state = Arc::new(state);

    // Spawn the tunnel client if identity allocated. Needs the engine
    // port, which we know now.
    spawn_tunnel_if_allocated(state.clone(), actual.port());

    // Bundled-/runtime-CLI lifecycles. Fire-and-forget — both publish
    // `HoustonEvent`s for the frontend to react to and never block the
    // engine's HTTP server from coming up. Composio resolves to the
    // bundled .app binary in production (no install step) or runs the
    // upstream `curl | bash` installer for dev / unbundled builds.
    // Claude Code is downloaded with sha256 verification using the
    // pinned manifest in cli-deps.json.
    spawn_cli_lifecycles(state.clone());

    let app = build_router(state);

    // Block on PATH resolution just before serving. DB init usually
    // takes longer than `zsh -l`, so this await is typically a no-op.
    // If PATH init panicked, log and continue with whatever the OnceLock
    // holds — routes fall back to the process PATH, which is degraded
    // but not fatal.
    //
    // The Windows git-bash task is NOT awaited here on purpose — see
    // the comment at its spawn site above.
    if let Err(e) = path_init.await {
        tracing::warn!("[boot] claude_path::init panicked: {e}");
    }

    if let Err(err) = axum::serve(listener, app).await {
        tracing::error!("server error: {err}");
        std::process::exit(1);
    }
}

/// Kick off the bundled-/runtime-CLI lifecycles in the background.
///
/// Both run on independent tasks so a slow/failed claude-code download
/// can't delay composio readiness (or vice versa). Each lifecycle emits
/// its own ready/failed events; the frontend listens on the WS firehose
/// and updates the relevant queries.
///
/// The DB and event sink are cloned into each task — both are cheap
/// `Arc` clones internally.
fn spawn_cli_lifecycles(state: Arc<ServerState>) {
    {
        let sink = state.engine.events.clone();
        let db = state.engine.db.clone();
        tokio::spawn(async move {
            houston_composio::lifecycle::ensure_and_upgrade(sink, db).await;
        });
    }
    {
        let sink = state.engine.events.clone();
        let db = state.engine.db.clone();
        tokio::spawn(async move {
            houston_claude_installer::ensure_and_upgrade(sink, db).await;
        });
    }
}

fn spawn_tunnel_if_allocated(state: Arc<ServerState>, engine_port: u16) {
    let Some(runtime) = state.tunnel_runtime.clone() else {
        return;
    };
    let identity = runtime.snapshot().identity;
    let cfg = TunnelConfig {
        home_dir: state.config.home_dir.clone(),
        tunnel_url: state.config.tunnel_url.clone(),
        identity,
        endpoint: EngineEndpoint::new(engine_port),
        runtime,
    };
    let client = TunnelClient::new(cfg, Arc::new(state.mobile_access.clone()));
    tokio::spawn(async move {
        client.run().await;
    });
}

fn init_tracing() {
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,houston=debug"));
    // Write tracing to STDERR, never stdout. `tracing_subscriber::fmt()`
    // defaults to stdout, but stdout is reserved for the single
    // `HOUSTON_ENGINE_LISTENING` banner line: the desktop supervisor
    // (`app/src-tauri/src/engine_supervisor.rs`) captures the engine's
    // stderr into `engine.log`, while its stdout drain only forwards the
    // banner. Leaving the default stdout writer left `engine.log` empty
    // and leaked every trace onto stdout (gethouston/houston#240).
    let fmt_layer = fmt::layer().with_target(false).with_writer(std::io::stderr);
    // sentry_tracing maps tracing::error! -> Sentry event and warn!/info! ->
    // breadcrumb (its default event_filter). No-op until `init_sentry` ran
    // (empty SENTRY_DSN => no client), so safe to register unconditionally.
    // Mirrors app/src-tauri/src/logging.rs. Keeping the default mapping means
    // the engine's many intentional WARNs (tunnel allocation, git-bash
    // extraction) stay breadcrumbs instead of spamming Sentry as events.
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(sentry_tracing::layer())
        .init();
}

/// Initialize Sentry for the engine process.
///
/// Gated on the `SENTRY_DSN` env var so the OPEN-SOURCE engine stays generic:
/// the Houston desktop app injects its DSN at spawn (see
/// `app/src-tauri/src/lib.rs`), and any other operator (Always On, a
/// self-hoster) sets their own. Empty/unset DSN → `None`, every capture is a
/// silent no-op. NEVER bake a DSN literal here.
///
/// Release + environment are honored from `SENTRY_RELEASE` / `SENTRY_ENVIRONMENT`
/// when injected, so engine events share the app's `houston-app@<version>`
/// release and resolve against the `houston-engine` debug files CI already
/// uploads. Standalone deployments fall back to `houston-engine@<ENGINE_VERSION>`
/// and a debug/release environment guess.
///
/// The returned guard MUST be held for the whole process lifetime.
fn init_sentry() -> Option<sentry::ClientInitGuard> {
    let dsn = std::env::var("SENTRY_DSN").unwrap_or_default();
    if dsn.trim().is_empty() {
        return None;
    }
    let release = resolve_sentry_release(std::env::var("SENTRY_RELEASE").ok());
    let environment =
        resolve_sentry_environment(std::env::var("SENTRY_ENVIRONMENT").ok(), cfg!(debug_assertions));
    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(release),
            environment: Some(environment),
            // before_send runs two passes, in order:
            //   1. scrub `--key <value>` composio credentials from any outbound
            //      event/breadcrumb, in case a future code path formats one into
            //      a tracing error (HOU-431). Defense-in-depth; the real fix is
            //      redaction at the source in `houston_composio::cli`.
            //   2. stamp a deterministic fingerprint so a family of
            //      near-identical messages (e.g. the Codex parser's per-column
            //      errors) collapses into ONE Sentry issue instead of dozens
            //      (HOU-449). Runs AFTER the scrub so the key is computed from
            //      the already-redacted message.
            before_send: Some(Arc::new(|event| {
                sentry_scrub::scrub_event(event).map(sentry_grouping::with_stable_fingerprint)
            })),
            // No `auto_session_tracking` field: the engine's Cargo.toml leaves
            // the `release-health` feature OFF (default-features = false), which
            // cfg-gates that field out entirely. That is intentional — the
            // desktop app owns session tracking; the engine must not
            // double-count. Sessions stay off because the feature is absent.
            ..Default::default()
        },
    ));
    // Tag every engine event so the shared `houston-app` Sentry project can
    // tell engine crashes apart from app / renderer crashes.
    sentry::configure_scope(|scope| scope.set_tag("runtime", "engine"));
    Some(guard)
}

/// Resolve the Sentry release string: honor an injected `SENTRY_RELEASE`
/// (the app passes `houston-app@<version>` so engine + app share one release),
/// else default to `houston-engine@<ENGINE_VERSION>`. Pure for testability.
fn resolve_sentry_release(env_release: Option<String>) -> Cow<'static, str> {
    match env_release {
        Some(r) if !r.trim().is_empty() => Cow::Owned(r),
        _ => Cow::Owned(format!("houston-engine@{ENGINE_VERSION}")),
    }
}

/// Resolve the Sentry environment: honor an injected `SENTRY_ENVIRONMENT`, else
/// `development` under debug builds and `production` otherwise (matching the
/// app). Pure for testability.
fn resolve_sentry_environment(env_environment: Option<String>, debug: bool) -> Cow<'static, str> {
    match env_environment {
        Some(e) if !e.trim().is_empty() => Cow::Owned(e),
        _ => Cow::Borrowed(if debug { "development" } else { "production" }),
    }
}

/// Exit the process when the parent that launched us closes our stdin.
///
/// The desktop supervisor (`app/src-tauri/src/engine_supervisor.rs`) pipes
/// the engine's stdin and never writes to it. The instant the app process
/// goes away — graceful quit, force-quit, panic, OOM kill — the OS closes
/// that pipe's write end and a blocking `read(stdin)` returns EOF. We treat
/// EOF as "the app that owns me is gone" and exit, so no orphaned engine
/// keeps holding its port after the app closes (gethouston/houston#306).
///
/// Gating (see `knowledge-base/engine-server.md` → "Parent watchdog"):
/// - Skipped when stdin is a TTY — you're running the binary by hand for
///   debugging and there is no supervisor to die.
/// - Skipped when `HOUSTON_NO_PARENT_WATCHDOG=1`. Standalone deployments
///   (Always On systemd / docker) wire stdin to `/dev/null`, which reports
///   EOF immediately; they opt out and own lifecycle some other way.
fn spawn_parent_watchdog() {
    let disable = std::env::var("HOUSTON_NO_PARENT_WATCHDOG").ok();
    if !watchdog_should_arm(disable.as_deref(), std::io::stdin().is_terminal()) {
        tracing::debug!("[watchdog] parent stdin watchdog disabled");
        return;
    }
    // A dedicated OS thread, not a tokio task: the read blocks for the whole
    // life of the process and must not tie up a runtime worker.
    std::thread::Builder::new()
        .name("parent-watchdog".into())
        .spawn(|| {
            block_until_stdin_closed(std::io::stdin().lock());
            tracing::info!("[watchdog] stdin closed — parent process gone, exiting engine");
            std::process::exit(0);
        })
        .expect("spawn parent-watchdog thread");
}

/// Whether the stdin-EOF watchdog should arm. Pure, so the gating contract
/// is unit-testable without touching real stdin. `disable_env` is the value
/// of `HOUSTON_NO_PARENT_WATCHDOG`; `stdin_is_tty` is
/// `std::io::stdin().is_terminal()`.
fn watchdog_should_arm(disable_env: Option<&str>, stdin_is_tty: bool) -> bool {
    if disable_env == Some("1") {
        return false;
    }
    !stdin_is_tty
}

/// Block until `reader` (the process stdin) reaches EOF or errors
/// unrecoverably. Pure (no process exit) so the read loop is unit-testable;
/// the caller decides what EOF means.
fn block_until_stdin_closed<R: Read>(mut reader: R) {
    let mut buf = [0u8; 256];
    loop {
        match reader.read(&mut buf) {
            // EOF: the parent closed the write end of the pipe.
            Ok(0) => return,
            // The supervisor never writes, but drain anything that shows up.
            Ok(_) => continue,
            // Retryable: a signal interrupted the read.
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            // Broken pipe / closed fd — treat the parent as gone.
            Err(_) => return,
        }
    }
}

fn write_manifest(cfg: &ServerConfig, port: u16) {
    let path = cfg.home_dir.join("engine.json");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut hasher = Sha256::new();
    hasher.update(cfg.token.as_bytes());
    let token_hash = format!("{:x}", hasher.finalize());
    let manifest = EngineManifest {
        version: ENGINE_VERSION,
        protocol: PROTOCOL_VERSION,
        port,
        pid: std::process::id(),
        token_hash,
    };
    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
        let _ = std::fs::write(&path, json);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        block_until_stdin_closed, resolve_sentry_environment, resolve_sentry_release,
        watchdog_should_arm,
    };
    use houston_engine_protocol::ENGINE_VERSION;
    use std::io::Cursor;

    #[test]
    fn sentry_release_honors_injected_value() {
        // The app injects `houston-app@<version>` so engine events land on the
        // same release as the app and resolve against the uploaded debug files.
        assert_eq!(
            resolve_sentry_release(Some("houston-app@0.4.17".into())),
            "houston-app@0.4.17"
        );
    }

    #[test]
    fn sentry_release_falls_back_to_engine_version() {
        // Standalone deployments (Always On / self-host) without an injected
        // release get a sensible engine-scoped default.
        let expected = format!("houston-engine@{ENGINE_VERSION}");
        assert_eq!(resolve_sentry_release(None), expected);
        // Blank/whitespace is treated as unset, not as a literal release.
        assert_eq!(resolve_sentry_release(Some("   ".into())), expected);
    }

    #[test]
    fn sentry_environment_honors_injected_value() {
        assert_eq!(
            resolve_sentry_environment(Some("staging".into()), true),
            "staging"
        );
    }

    #[test]
    fn sentry_environment_defaults_by_build_profile() {
        // No injection → debug builds report development, release builds prod.
        assert_eq!(resolve_sentry_environment(None, true), "development");
        assert_eq!(resolve_sentry_environment(None, false), "production");
        // Blank is treated as unset.
        assert_eq!(resolve_sentry_environment(Some("".into()), false), "production");
    }

    #[test]
    fn watchdog_disabled_by_env_regardless_of_stdin() {
        // The explicit opt-out wins whether or not stdin looks like a TTY.
        assert!(!watchdog_should_arm(Some("1"), false));
        assert!(!watchdog_should_arm(Some("1"), true));
    }

    #[test]
    fn watchdog_only_disabled_by_exact_one() {
        // Any value other than "1" leaves the watchdog armed (when not a TTY),
        // so a stray `HOUSTON_NO_PARENT_WATCHDOG=0` can't silently leak engines.
        assert!(watchdog_should_arm(Some("0"), false));
        assert!(watchdog_should_arm(Some("true"), false));
        assert!(watchdog_should_arm(Some(""), false));
    }

    #[test]
    fn watchdog_skipped_on_tty() {
        // Running the binary by hand in a terminal must not self-terminate.
        assert!(!watchdog_should_arm(None, true));
    }

    #[test]
    fn watchdog_arms_when_piped_and_not_disabled() {
        // The desktop supervisor case: piped (non-TTY) stdin, no opt-out.
        assert!(watchdog_should_arm(None, false));
    }

    #[test]
    fn read_loop_returns_on_immediate_eof() {
        // Empty stdin (already-closed pipe, /dev/null) → EOF on first read.
        // If the loop didn't terminate, this test would hang.
        block_until_stdin_closed(Cursor::new(Vec::<u8>::new()));
    }

    #[test]
    fn read_loop_drains_then_returns_on_eof() {
        // Bytes available, then EOF — the loop drains the data and still
        // terminates rather than spinning.
        block_until_stdin_closed(Cursor::new(b"stray bytes before parent exits".to_vec()));
    }
}
