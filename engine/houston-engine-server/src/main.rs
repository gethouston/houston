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
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

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
    init_tracing();

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

    // Orphan-CLI reap: kill any `claude` / `codex` subprocesses the
    // previous engine instance left running. Their parent died but on
    // Unix they get reparented to launchd / systemd and keep streaming
    // until they SIGPIPE-die — which can mean tens of seconds of
    // wasted API quota and confusing dual-write to `chat_feed`. Run
    // BEFORE the activity reconciliation so the activity rows are
    // already corpse-free when the reaper marks them Interrupted.
    match houston_engine_core::runtime_pids::reap_orphans(&state.config.home_dir) {
        Ok(0) => {}
        Ok(n) => tracing::info!("[runtime_pids] reaped {n} orphan CLI subprocess(es)"),
        Err(e) => tracing::warn!("[runtime_pids] orphan reap failed: {e}"),
    }

    // Reaper: boot-time reconciliation (transition every stale in-flight
    // activity that the previous engine instance left behind) plus a
    // periodic sweep so any future death heals within ~10s without a
    // restart. Boot reconciliation runs BEFORE serving so the very first
    // HTTP request sees the post-reconcile state instead of an orphan
    // `running` row.
    let docs_for_reaper = state.config.docs_dir.clone();
    let home_for_reaper = state.config.home_dir.clone();
    let events_for_reaper = state.engine.events.clone();
    match houston_engine_core::reaper::reconcile_on_boot(
        &home_for_reaper,
        &docs_for_reaper,
        &events_for_reaper,
    ) {
        Ok(0) => {}
        Ok(n) => tracing::info!("[reaper] boot reconciliation: {n} activity(s) → interrupted"),
        Err(e) => tracing::warn!("[reaper] boot reconciliation failed: {e}"),
    }
    spawn_reaper_loop(state.clone());

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

    // SIGTERM lands here ungracefully. The reaper's boot reconciliation
    // catches any in-flight rows when the next engine instance starts —
    // we don't need a custom drain. axum's default `serve` exits when
    // the listener closes; the supervisor sees the exit and restarts.
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

/// Spawn the background reaper sweep. Runs forever; uses the same
/// event sink as everything else so transitions fan out to WS clients.
fn spawn_reaper_loop(state: Arc<ServerState>) {
    let home_dir = state.config.home_dir.clone();
    let docs_dir = state.config.docs_dir.clone();
    let events = state.engine.events.clone();
    tokio::spawn(async move {
        houston_engine_core::reaper::run_reaper_loop(home_dir, docs_dir, events).await;
    });
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
    use tracing_subscriber::{fmt, EnvFilter};
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,houston=debug"));
    fmt().with_env_filter(filter).with_target(false).init();
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
