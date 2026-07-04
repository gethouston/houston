mod auth;
mod bug_report;
mod codex_oauth_loopback;
mod commands;
#[cfg(target_os = "macos")]
mod dmg_guard;
mod engine_supervisor;
mod houston_prompt;
mod logging;
mod loopback_util;
mod notification;
mod oauth_loopback;
mod window_focus;

use engine_supervisor::{
    resolve_engine_binary, spawn_supervisor, EngineHandshake, SupervisorCallbacks,
};
// The default (Rust-engine) path health-checks `/v1/health`; the host-sidecar
// path health-checks the host's `/health` and reserves a loopback port to hand
// the host (it echoes the *requested* port in its banner). Import per feature so
// neither pulls in an unused symbol.
#[cfg(not(feature = "host-sidecar"))]
use engine_supervisor::wait_until_healthy;
#[cfg(feature = "host-sidecar")]
use engine_supervisor::{reserve_free_port, wait_until_host_healthy};
use houston_tauri::houston_db::Database;
use houston_tauri::state::AppState;
use houston_ui_events::HoustonEvent;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

/// Tauri-managed state holding the latest engine handshake so the frontend
/// can pull it on demand via `get_engine_handshake` — wins the race when
/// the one-shot `houston-engine-ready` event fires before the webview's
/// `listen()` registers.
#[derive(Default)]
struct EngineHandshakeState(Mutex<Option<EngineHandshake>>);

#[tauri::command]
fn get_engine_handshake(
    state: tauri::State<'_, EngineHandshakeState>,
) -> Result<serde_json::Value, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let h = guard
        .as_ref()
        .ok_or_else(|| "engine not ready".to_string())?;
    Ok(serde_json::json!({
        "baseUrl": h.base_url(),
        "token": h.token,
    }))
}

/// Supervisor callback that toasts the UI on each engine restart.
struct TauriSupervisorCallbacks {
    handle: tauri::AppHandle,
}

impl SupervisorCallbacks for TauriSupervisorCallbacks {
    fn on_restart(&self, handshake: &EngineHandshake) {
        tracing::info!(
            "[engine] restarted on {} (token redacted)",
            handshake.base_url()
        );
        let payload = serde_json::json!({
            "baseUrl": handshake.base_url(),
            "token": handshake.token,
        });
        let _ = self.handle.emit("houston-engine-restarted", payload);
        let _ = self.handle.emit(
            "houston-event",
            HoustonEvent::CompletionToast {
                title: "Engine reconnected".into(),
                issue_id: None,
            },
        );
    }
}

/// Truthy check for the `SENTRY_SEND_IN_DEV` opt-in. Accepts `1`, `true`,
/// `yes`, `on` (any case, surrounding whitespace ignored); everything else
/// (including unset) is off. Pure for testability.
fn sentry_send_in_dev_enabled(raw: Option<&str>) -> bool {
    matches!(
        raw.map(|v| v.trim().to_ascii_lowercase()).as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

/// Whether to activate Sentry. Needs a DSN, and in a debug build only when the
/// `SENTRY_SEND_IN_DEV` opt-in is set — a HARD gate (no client at all), not the
/// soft `environment: development` tag, so dev errors never reach the prod
/// `houston-app` project. Pure for testability.
fn sentry_should_activate(dsn_empty: bool, debug: bool, send_in_dev: bool) -> bool {
    !dsn_empty && (!debug || send_in_dev)
}

/// Build the Sentry env vars to inject into the engine subprocess. EMPTY when
/// Sentry is inactive, so the engine stays a silent no-op — the "app injects NO
/// DSN → engine dormant" contract (the supervisor additionally strips any
/// inherited SENTRY_* so this is the engine's only source). When active, always
/// forwards DSN/RELEASE/ENVIRONMENT so engine events share the app's project +
/// release; additionally forwards `SENTRY_SEND_IN_DEV=1` when the app opted into
/// dev sending, so a debug engine sidecar's own dev gate (`main::init_sentry`)
/// agrees instead of self-suppressing. Pure for testability.
fn engine_sentry_env(
    active: bool,
    send_in_dev: bool,
    dsn: &str,
    release: &str,
    environment: &str,
) -> Vec<(String, String)> {
    if !active {
        return Vec::new();
    }
    let mut env = vec![
        ("SENTRY_DSN".to_string(), dsn.to_string()),
        ("SENTRY_RELEASE".to_string(), release.to_string()),
        ("SENTRY_ENVIRONMENT".to_string(), environment.to_string()),
    ];
    if send_in_dev {
        env.push(("SENTRY_SEND_IN_DEV".to_string(), "1".to_string()));
    }
    env
}

pub fn run() {
    // First-launch DMG guard (macOS only). If we were double-clicked from
    // inside the installer DMG (path under /Volumes/…), show a native
    // dialog asking the user to move Houston to Applications, do the
    // copy + relaunch, and exit this process. Must run BEFORE Sentry +
    // logging init so the in-DMG instance never touches `~/.houston/`.
    #[cfg(target_os = "macos")]
    dmg_guard::handle_if_needed();

    // `houston_dir()` flips to `~/.dev-houston/` in debug builds so
    // `pnpm tauri dev` stays isolated from an installed release of Houston.
    let houston = houston_tauri::houston_db::db::houston_dir();

    // Sentry MUST init before logging so the tracing subscriber's
    // sentry_tracing layer (registered in logging::init) has a live client
    // to forward breadcrumbs/events to from the first emitted record. Init
    // also installs the panic handler before any plugin setup runs.
    //
    // `release` = `houston-app@<CARGO_PKG_VERSION>` via release_name!() — MUST
    // match the `--release` flag passed to sentry-cli sourcemaps + debug-files
    // uploads in .github/workflows/release.yml, otherwise stack traces won't
    // resolve. release.yml derives the same string from the git tag.
    //
    // `environment` separates production crashes (real users on installed
    // builds) from development noise (someone running `pnpm tauri dev` with
    // a DSN exported). Tile filters in Sentry default to production.
    let sentry_dsn = option_env!("SENTRY_DSN").unwrap_or("");
    // Compute release + environment ONCE so the app's own Sentry client AND the
    // engine subprocess (handed these via env at spawn, below) land on the SAME
    // release tag + environment in the shared `houston-app` project. The
    // release equals `sentry::release_name!()` (`houston-app@<CARGO_PKG_VERSION>`)
    // for release builds; we build it explicitly so it can also be forwarded to
    // the engine. It MUST match the `--release` the .github/workflows/release.yml
    // upload steps use, or stack traces won't resolve.
    let sentry_release = if cfg!(debug_assertions) {
        format!("houston-app@{}-dev", env!("CARGO_PKG_VERSION"))
    } else {
        format!("houston-app@{}", env!("CARGO_PKG_VERSION"))
    };
    let sentry_environment = if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    };
    // Dev builds suppress Sentry unless SENTRY_SEND_IN_DEV is set, so a dev
    // running with the prod DSN exported doesn't pollute the prod project
    // (HOU-469). `option_env!` reads it at compile time, matching SENTRY_DSN.
    let sentry_send_in_dev =
        sentry_send_in_dev_enabled(option_env!("SENTRY_SEND_IN_DEV"));
    let sentry_active = sentry_should_activate(
        sentry_dsn.is_empty(),
        cfg!(debug_assertions),
        sentry_send_in_dev,
    );
    let _sentry_client = if !sentry_active {
        None
    } else {
        Some(sentry::init((
            sentry_dsn,
            sentry::ClientOptions {
                release: Some(std::borrow::Cow::Owned(sentry_release.clone())),
                environment: Some(std::borrow::Cow::Borrowed(sentry_environment)),
                auto_session_tracking: true,
                ..Default::default()
            },
        )))
    };

    // Logging second so the sentry_tracing layer captures everything from
    // here onwards, including engine subprocess spawn logs and plugin setup.
    logging::init(&houston);

    let mut builder = tauri::Builder::default();

    // Single-instance plugin — MUST be registered before the deep-link
    // plugin on Windows / Linux so its second-instance argv-forwarding
    // is the one the deep-link plugin attaches to. Without this, every
    // `houston://auth-callback?...` from the Google OAuth flow launches
    // a fresh houston-app.exe (the OS protocol handler does this by
    // design — Start-menu launches resolve to `C:\Program Files\Houston\…`
    // and protocol-handler launches resolve to the 8.3 short form
    // `C:\PROGRA~1\Houston\…`, both visible as separate engine spawns
    // in `backend.log` on the bad path) while the primary instance
    // sits on the login screen waiting for an event that never arrives.
    //
    // The callback below also raises the primary window so the user
    // sees the auth state transition (browser → app) immediately.
    //
    // No-op on macOS — NSWorkspace delivers `houston://` URLs to the
    // running app natively, no second instance is ever spawned.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, _argv, _cwd| {
                tracing::info!(
                    "[single-instance] secondary launch routed to primary"
                );
                window_focus::bring_to_front(app);
            },
        ));
    }

    // Sentry plugin — only if DSN was provided
    if let Some(ref client) = _sentry_client {
        builder = builder.plugin(tauri_plugin_sentry::init(client));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .setup(move |app| {
            // Deep-link handler for Google-OAuth callbacks
            // (`houston://auth-callback?code=...`). Forwards the URL to the
            // frontend; Supabase's PKCE exchange runs in JS so the verifier
            // stays in Keychain-backed storage end-to-end.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        // Any deep link brings Houston forward — e.g. the
                        // "Open Houston" button on the sign-in success page
                        // (`houston://open`), or the `houston://auth-callback`
                        // fallback when the loopback couldn't bind.
                        window_focus::bring_to_front(&handle);
                        // Only the OAuth callback carries a code/error for the
                        // webview to exchange; a bare `houston://open` is
                        // focus-only (routing it through the auth path would
                        // surface a spurious "missing authorization code").
                        if url.host_str() == Some("auth-callback") {
                            auth::emit_deep_link(&handle, url.as_str());
                        }
                    }
                });
            }

            // Resolve the user's shell PATH early so provider checks work
            // in release builds (macOS .app bundles get a minimal PATH).
            houston_tauri::houston_terminal_manager::claude_path::init();

            let houston = houston_tauri::houston_db::db::houston_dir();
            let db_path = houston.join("db").join("houston.db");
            let db = tauri::async_runtime::block_on(async {
                Database::connect(&db_path)
                    .await
                    .expect("Failed to open database")
            });

            // One-time migration: earlier versions stored workspaces under
            // `~/Documents/Houston/`. New default is `$HOUSTON_HOME/workspaces/`
            // so everything Houston owns is under a single discoverable root.
            // Move the legacy directory if it exists and the new location is
            // empty. Idempotent on subsequent launches.
            migrate_legacy_docs_dir(&houston);

            // Eagerly run the intra-agent data-layout migration on every
            // agent the user already has. Previously this only fired the
            // first time a user started a session on each agent, which
            // meant upgraders who just BROWSED the Activity tab saw an
            // empty board even though their `.houston/activity.json` was
            // sitting next to it. Walk the workspaces dir here so existing
            // activities, routines, learnings show up immediately.
            migrate_all_agents(&houston.join("workspaces"));

            // AppState keeps a DB handle for any OS-native lookup (log
            // reading, session search). Domain state now lives in the
            // engine subprocess.
            app.manage(AppState {
                db,
                event_queue: None,
                scheduler: None,
            });

            // --- Spawn houston-engine as a subprocess --------------------
            //
            // All domain calls go through the engine over HTTP/WS. The
            // supervisor thread restarts it with exponential backoff on
            // crash and emits a toast via `houston-event` on each reconnect.
            //
            // Cutover host mode: when VITE_NEW_ENGINE_URL (static token) or
            // VITE_HOSTED_ENGINE_URL (Supabase bearer) is set, the frontend
            // talks to an external Houston host/gateway (see app/src/lib/engine.ts),
            // so don't spawn or health-check the Rust engine sidecar at all.
            //
            // Two places to look: the runtime env covers `pnpm tauri dev`
            // (Vite and this process share the shell env), while `option_env!`
            // covers PACKAGED cloud builds — release CI bakes the gateway URL
            // into the frontend at compile time, and the installed app's
            // runtime env is empty, so without the compile-time check a cloud
            // app would spawn an idle sidecar it never talks to.
            let host_mode = [
                option_env!("VITE_NEW_ENGINE_URL"),
                option_env!("VITE_HOSTED_ENGINE_URL"),
            ]
            .iter()
            .any(|v| v.is_some_and(|v| !v.trim().is_empty()))
                || ["VITE_NEW_ENGINE_URL", "VITE_HOSTED_ENGINE_URL"]
                    .iter()
                    .any(|name| {
                        std::env::var(name)
                            .map(|v| !v.trim().is_empty())
                            .unwrap_or(false)
                    });
            if host_mode {
                tracing::info!(
                    "[engine] host mode — skipping the Rust engine sidecar"
                );
                // Keep get_engine_handshake callable (the frontend skips it here).
                app.manage(EngineHandshakeState::default());
            } else {
                // `host-sidecar` feature: spawn the Bun-compiled Houston host
                // (packages/host/src/local/main.ts) as the sidecar and
                // drive the frontend into control-plane mode against it. Default
                // (feature off): the Rust engine — unchanged, so main stays
                // releasable. Both spawners are `#[cfg]`-gated (not a runtime
                // `cfg!`) so only the selected one is even compiled; the host
                // arm references feature-gated supervisor helpers that don't
                // exist when the feature is off.
                #[cfg(feature = "host-sidecar")]
                spawn_host_sidecar(
                    app,
                    &houston,
                    sentry_active,
                    sentry_send_in_dev,
                    sentry_dsn,
                    &sentry_release,
                    sentry_environment,
                );
                #[cfg(not(feature = "host-sidecar"))]
                spawn_rust_engine(
                    app,
                    &houston,
                    sentry_active,
                    sentry_send_in_dev,
                    sentry_dsn,
                    &sentry_release,
                    sentry_environment,
                );
            }

            // Size window to 80% of the screen so it looks good on any display
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let screen = monitor.size();
                    let scale = monitor.scale_factor();
                    let w = (screen.width as f64 / scale * 0.80) as f64;
                    let h = (screen.height as f64 / scale * 0.80) as f64;
                    let _ = window.set_size(tauri::LogicalSize::new(w, h));
                    window.center().ok();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // OS-native glue — everything domain-related flows through the
            // engine over HTTP/WS, not Tauri IPC.
            commands::os::pick_directory,
            commands::os::open_url,
            commands::os::open_file,
            commands::os::reveal_file,
            commands::os::reveal_agent,
            commands::os::reveal_path,
            commands::terminal::open_terminal,
            commands::os::check_claude_cli,
            commands::portable::save_portable_agent,
            commands::portable::open_portable_agent,
            commands::update::current_app_bundle_path,
            commands::update::relaunch_app_from_path,
            // Hidden Sentry smoke command for native stack verification.
            commands::diagnostics::sentry_native_stack_smoke_test,
            // Logging (writes to local log files).
            logging::write_frontend_log,
            logging::read_recent_logs,
            // Linux/Windows session-finished notifications whose click brings
            // the window forward + emits `app-activated` (macOS uses the JS
            // notification plugin — see session-notifications.ts).
            notification::show_session_notification,
            // Native network delivery for bug reports. Avoids webview CORS and
            // keeps Linear credentials out of the JavaScript bundle.
            bug_report::report_bug,
            // Engine handshake pull (race-free fallback for `EngineGate`).
            get_engine_handshake,
            // Keychain-backed storage for Supabase auth sessions.
            auth::auth_get_item,
            auth::auth_set_item,
            auth::auth_remove_item,
            // One-shot loopback listener for the Google OAuth redirect —
            // keeps desktop sign-in on the user's machine (no website relay,
            // no custom-scheme dialog).
            oauth_loopback::start_oauth_loopback,
            // One-shot loopback listener for the OpenAI Codex OAuth redirect —
            // binds the fixed port 1455 OpenAI registered and forwards the raw
            // callback query to the webview as `codex-oauth://callback`.
            codex_oauth_loopback::start_codex_oauth_loopback,
            // Pull the app to the foreground when a flow finishes in the
            // browser (e.g. a Composio integration connection landing).
            window_focus::focus_main_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                // App-level activation (cmd+tab, dock click, etc.)
                tauri::RunEvent::Resumed => {
                    tracing::info!("[app] RunEvent::Resumed — bringing window to front");
                    window_focus::bring_to_front(app_handle);
                    let _ = app_handle.emit("app-activated", ());
                }
                tauri::RunEvent::WindowEvent {
                    label,
                    event: tauri::WindowEvent::Focused(true),
                    ..
                } if label == "main" => {
                    tracing::debug!("[app] WindowEvent::Focused(true) — emitting app-activated");
                    let _ = app_handle.emit("app-activated", ());
                }
                // App is exiting — tell the supervisor so the engine's imminent
                // exit is treated as deliberate (no spurious "engine crashed"
                // Sentry event on quit, especially the Windows force-kill path).
                tauri::RunEvent::Exit => {
                    engine_supervisor::mark_shutting_down();
                }
                _ => {}
            }
        });
}

/// Spawn the Rust `houston-engine` as the sidecar (default build) and inject
/// the `{baseUrl, token}` handshake the frontend's Rust-engine adapter reads.
///
/// This is the unchanged, releasable path — extracted verbatim from `setup()`
/// so the two spawners (this and `spawn_host_sidecar`) are symmetric
/// `#[cfg]`-gated siblings instead of an inline `if/else` that would force an
/// extra indent level on the larger arm.
#[cfg(not(feature = "host-sidecar"))]
fn spawn_rust_engine(
    app: &tauri::App,
    houston: &std::path::Path,
    sentry_active: bool,
    sentry_send_in_dev: bool,
    sentry_dsn: &str,
    sentry_release: &str,
    sentry_environment: &str,
) {
    let resource_dir = app.path().resource_dir().ok();
    let binary = resolve_engine_binary(resource_dir.as_ref())
        .expect("houston-engine binary missing — check externalBin bundling");
    tracing::info!("[engine] spawning {}", binary.display());

    let cb: Arc<TauriSupervisorCallbacks> = Arc::new(TauriSupervisorCallbacks {
        handle: app.handle().clone(),
    });
    // Product-layer prompts live in the `houston_prompt` module and are
    // exported to the engine via env vars. The engine treats these
    // as opaque strings — it has no hardcoded Houston copy.
    //
    // Also pin HOUSTON_HOME + HOUSTON_DOCS so the engine uses the
    // same data roots as the app. Workspaces live under
    // `$HOUSTON_HOME/workspaces/` in both debug (`~/.dev-houston/`)
    // and release (`~/.houston/`) — everything Houston writes is
    // rooted at a single discoverable location.
    let docs_dir = houston.join("workspaces");
    let mut engine_env: Vec<(String, String)> = vec![
        (
            "HOUSTON_APP_SYSTEM_PROMPT".into(),
            houston_prompt::system_prompt(),
        ),
        (
            "HOUSTON_APP_ONBOARDING_PROMPT".into(),
            houston_prompt::onboarding_prompt(),
        ),
        ("HOUSTON_HOME".into(), houston.display().to_string()),
        ("HOUSTON_DOCS".into(), docs_dir.display().to_string()),
    ];
    if let Some(store_dir) = resource_dir
        .as_ref()
        .map(|dir| dir.join("store"))
        .filter(|dir| dir.join("catalog.json").exists())
    {
        engine_env.push(("HOUSTON_STORE_DIR".into(), store_dir.display().to_string()));
    }
    // If a Supabase session is already persisted in Keychain (user
    // signed in on a previous launch), stamp the subprocess with the
    // user_id so future cloud-side operations can attribute work to
    // a user. Engine is prompt-agnostic about identity — treats this
    // as an opaque string. Local/ad-hoc builds compile auth storage
    // in browser mode, so this returns before touching Keychain.
    if let Some(user_id) = auth::persisted_user_id() {
        engine_env.push(("HOUSTON_APP_USER_ID".into(), user_id));
    }
    // Pass through `HOUSTON_TUNNEL_URL` for local relay dev
    // (`wrangler dev` on localhost:8787). Production uses the
    // engine's baked-in default (`tunnel.gethouston.ai`).
    if let Ok(v) = std::env::var("HOUSTON_TUNNEL_URL") {
        if !v.is_empty() {
            engine_env.push(("HOUSTON_TUNNEL_URL".into(), v));
        }
    }
    // Hand our Sentry config to the engine subprocess so engine-side
    // panics + `tracing::error!` land in the SAME Sentry project, under
    // the SAME release, tagged `runtime=engine` (the engine reads these
    // in `main::init_sentry`). Gated on the same `sentry_active`
    // decision as the app's own client, so forks / dev builds (without
    // the SENTRY_SEND_IN_DEV opt-in) inject nothing and the engine
    // stays a silent no-op. The engine debug files CI uploads then
    // become useful.
    engine_env.extend(engine_sentry_env(
        sentry_active,
        sentry_send_in_dev,
        sentry_dsn,
        sentry_release,
        sentry_environment,
    ));
    // 30s banner timeout: first-run Gatekeeper scan on a notarized
    // sidecar can take 15–20s on slow machines.
    let slot = spawn_supervisor(binary, Duration::from_secs(30), engine_env, cb)
        .expect("failed to spawn houston-engine");
    let handshake = {
        let guard = slot.lock().expect("engine slot poisoned");
        guard
            .as_ref()
            .expect("engine subprocess missing after spawn")
            .handshake
            .clone()
    };
    // 30s matches the banner timeout above. On first launch the
    // engine has to import the bundled certificates, run a
    // login-shell PATH probe, and (on Windows) kick off
    // PortableGit extraction in the background. The shorter
    // 5s budget we used before turned out to be the trigger
    // for a Windows crash loop: any startup path that crossed
    // it killed the engine subprocess, which on Windows meant
    // an in-flight PortableGit extraction was never finalized
    // and re-fired identically on every relaunch.
    wait_until_healthy(&handshake, Duration::from_secs(30))
        .expect("engine did not pass /v1/health in time");

    // Stash the handshake so the frontend can pull it via
    // `get_engine_handshake` — wins the race when the one-shot
    // `houston-engine-ready` event fires before the webview's
    // `listen()` registers (common in dev + cold Vite).
    let handshake_state = EngineHandshakeState::default();
    *handshake_state.0.lock().unwrap() = Some(handshake.clone());
    app.manage(handshake_state);

    // Inject bootstrap so `app/src/lib/engine.ts::resolveConfig`
    // picks it up before any HoustonClient call fires.
    //
    // Two delivery paths because the webview + React may mount
    // BEFORE `setup()` finishes waiting on /v1/health:
    //   1. `window.eval` — fastest path, wins if the webview hasn't
    //      loaded the JS bundle yet.
    //   2. `houston-engine-ready` Tauri event — the frontend's
    //      `EngineGate` awaits this before rendering the app, so a
    //      slow health check simply shows a splash instead of
    //      crashing the React tree.
    let init_script = format!(
        "window.__HOUSTON_ENGINE__ = {{ baseUrl: \"{}\", token: \"{}\" }};",
        handshake.base_url(),
        handshake.token.replace('"', "\\\"")
    );
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.eval(&init_script) {
            tracing::error!("[engine] failed to inject bootstrap: {e}");
        }
    }
    let ready_payload = serde_json::json!({
        "baseUrl": handshake.base_url(),
        "token": handshake.token,
    });
    if let Err(e) = app.emit("houston-engine-ready", ready_payload) {
        tracing::error!("[engine] failed to emit ready event: {e}");
    }
}

/// Spawn the Bun-compiled Houston host as the sidecar (`host-sidecar` feature)
/// and drive the frontend into control-plane mode against it.
///
/// Mirrors the Rust-engine spawn in `setup()` but:
///   - hands the host its OWN env contract: `HOUSTON_WORKSPACES_ROOT`,
///     `HOUSTON_CREDENTIALS_PATH`, a reserved `HOUSTON_HOST_PORT`, and the
///     product voice via `HOUSTON_APP_SYSTEM_PROMPT` (read by
///     packages/host/src/local/main.ts). The host mints its OWN
///     crypto-strong per-boot token (`randomBytes(32)`) and echoes it in the
///     `HOUSTON_HOST_LISTENING` banner — we read it back rather than minting a
///     weaker one in Rust, so the handshake token is still random per boot.
///   - parses the host banner (`engine_supervisor::parse_banner` accepts both
///     `HOUSTON_ENGINE_LISTENING` and `HOUSTON_HOST_LISTENING`).
///   - health-checks the host's `/health` (the engine's `/v1/health` is a
///     different surface).
///   - injects `window.__HOUSTON_CP__ = true` ALONGSIDE the `__HOUSTON_ENGINE__`
///     handshake, so `app/src/lib/engine.ts` runs the control-plane adapter
///     against the sidecar — the runtime equivalent of setting
///     `VITE_NEW_ENGINE_URL`, but pointed at our own spawned host.
#[cfg(feature = "host-sidecar")]
fn spawn_host_sidecar(
    app: &tauri::App,
    houston: &std::path::Path,
    sentry_active: bool,
    sentry_send_in_dev: bool,
    sentry_dsn: &str,
    sentry_release: &str,
    sentry_environment: &str,
) {
    let resource_dir = app.path().resource_dir().ok();
    // The staged host lives at the SAME externalBin path the Rust engine would
    // (`binaries/houston-engine-<triple>`), so the existing resolver finds it.
    let binary = resolve_engine_binary(resource_dir.as_ref())
        .expect("houston host binary missing — check externalBin bundling / run scripts/build-host-sidecar.sh");
    tracing::info!("[host] spawning sidecar {}", binary.display());

    let port = reserve_free_port().expect("could not reserve a loopback port for the host sidecar");

    let workspaces_root = houston.join("workspaces");
    let credentials_path = houston.join("credentials.json");

    let mut host_env: Vec<(String, String)> = vec![
        (
            "HOUSTON_WORKSPACES_ROOT".into(),
            workspaces_root.display().to_string(),
        ),
        (
            "HOUSTON_CREDENTIALS_PATH".into(),
            credentials_path.display().to_string(),
        ),
        ("HOUSTON_HOST_PORT".into(), port.to_string()),
        // The product voice — the host reads this exact env var and injects it
        // into every runtime it spawns (main.ts → buildLocalHost.systemPrompt).
        (
            "HOUSTON_APP_SYSTEM_PROMPT".into(),
            houston_prompt::system_prompt(),
        ),
    ];
    // Integrations gateway (platform-mode Composio): Houston's cloud host owns
    // the platform key; this desktop host only forwards with the user's
    // Supabase session. Runtime env wins (dev override), else the compile-time
    // URL CI bakes in. No URL → the host runs with integrations off. The URL
    // is configuration, not a secret; the KEY never appears here at all.
    if let Some(url) = std::env::var("HOUSTON_INTEGRATIONS_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .or_else(|| option_env!("HOUSTON_INTEGRATIONS_URL").map(str::to_string))
        .filter(|v| !v.is_empty())
    {
        host_env.push(("HOUSTON_INTEGRATIONS_URL".into(), url));
    }
    // Dev/self-host escape hatch: a locally-exported platform key makes the
    // host call Composio directly (packages/host/src/local/main.ts). Never
    // baked at compile time — a shared key must not ship in a client binary.
    if let Ok(key) = std::env::var("COMPOSIO_API_KEY") {
        if !key.is_empty() {
            host_env.push(("COMPOSIO_API_KEY".into(), key));
        }
    }
    // Same Sentry-forwarding contract as the engine path, gated on the same
    // `sentry_active` decision (and forwarding the SENTRY_SEND_IN_DEV opt-in),
    // so host-side crashes land in the shared project under the same release
    // and dev builds without the opt-in inject nothing. The host treats these
    // as opaque if it has no Sentry wiring yet — harmless.
    host_env.extend(engine_sentry_env(
        sentry_active,
        sentry_send_in_dev,
        sentry_dsn,
        sentry_release,
        sentry_environment,
    ));

    let cb: Arc<TauriSupervisorCallbacks> = Arc::new(TauriSupervisorCallbacks {
        handle: app.handle().clone(),
    });
    // 30s banner timeout — matches the engine path; a notarized sidecar's
    // first-run Gatekeeper scan can take 15–20s.
    let slot = spawn_supervisor(binary, Duration::from_secs(30), host_env, cb)
        .expect("failed to spawn houston host sidecar");
    let handshake = {
        let guard = slot.lock().expect("host slot poisoned");
        guard
            .as_ref()
            .expect("host subprocess missing after spawn")
            .handshake
            .clone()
    };

    wait_until_host_healthy(&handshake, Duration::from_secs(30))
        .expect("host sidecar did not pass /health in time");

    // Stash the handshake for the `get_engine_handshake` pull (race-free fallback).
    let handshake_state = EngineHandshakeState::default();
    *handshake_state.0.lock().unwrap() = Some(handshake.clone());
    app.manage(handshake_state);

    // Inject BOTH the handshake AND the control-plane flag before any client
    // call fires. `__HOUSTON_CP__` switches `app/src/lib/engine.ts` onto the
    // control-plane adapter (the new-engine alias); without it the frontend
    // would speak the Rust wire to a host that doesn't answer it.
    let init_script = format!(
        "window.__HOUSTON_CP__ = true; window.__HOUSTON_ENGINE__ = {{ baseUrl: \"{}\", token: \"{}\" }};",
        handshake.base_url(),
        handshake.token.replace('"', "\\\"")
    );
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.eval(&init_script) {
            tracing::error!("[host] failed to inject bootstrap: {e}");
        }
    }
    let ready_payload = serde_json::json!({
        "baseUrl": handshake.base_url(),
        "token": handshake.token,
    });
    if let Err(e) = app.emit("houston-engine-ready", ready_payload) {
        tracing::error!("[host] failed to emit ready event: {e}");
    }
}

/// Walk every agent under `<workspaces>/<workspace>/<agent>/` and run
/// `houston_agent_files::migrate_agent_data` on each. Idempotent — only
/// does real work for agents whose `.houston/` is still in the legacy flat
/// layout or still has a `memory/learnings.md` that needs rewriting.
///
/// Exists because the per-agent migration used to be gated behind
/// `seed_agent()`, which only runs when the user starts a session, creates
/// an agent, or fires a routine. Upgraders from v0.3.x who simply browsed
/// the Activity / Learnings tabs saw empty boards even though the legacy
/// files sat right beside the new paths the UI was polling.
fn migrate_all_agents(workspaces_root: &std::path::Path) {
    let entries = match std::fs::read_dir(workspaces_root) {
        Ok(it) => it,
        Err(_) => return, // no workspaces yet — nothing to migrate
    };

    for ws_entry in entries.flatten() {
        let ws_path = ws_entry.path();
        if !ws_path.is_dir() {
            continue;
        }
        let ws_name = ws_path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if ws_name.starts_with('.') {
            continue;
        }

        let agent_entries = match std::fs::read_dir(&ws_path) {
            Ok(it) => it,
            Err(e) => {
                tracing::warn!("[migrate-agents] read_dir({}) failed: {e}", ws_path.display());
                continue;
            }
        };

        for agent_entry in agent_entries.flatten() {
            let agent_path = agent_entry.path();
            if !agent_path.is_dir() {
                continue;
            }
            let agent_name = agent_path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if agent_name.starts_with('.') {
                continue;
            }
            // Only agents that already have a `.houston/` dir — otherwise
            // we'd eagerly create one for every random folder in the tree.
            if !agent_path.join(".houston").is_dir() {
                continue;
            }
            if let Err(e) = houston_tauri::houston_agent_files::migrate_agent_data(&agent_path) {
                tracing::warn!(
                    "[migrate-agents] migrate_agent_data({}) failed: {e}",
                    agent_path.display()
                );
            }
        }
    }
}

/// Move `~/Documents/Houston/` to `$houston/workspaces/` if:
///   - the legacy dir exists and has content (workspaces.json),
///   - the new location is empty or missing workspaces.json.
///
/// Idempotent. Safe to call on every launch — real work only on the
/// first v0.4.2+ boot for anyone who previously ran v0.3.x/v0.4.0–v0.4.1.
/// On any error we log + bail; the engine will still run against the new
/// empty path. Original legacy dir is left in place as manual rollback.
fn migrate_legacy_docs_dir(houston: &std::path::Path) {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };
    let legacy = home.join("Documents").join("Houston");
    let new_root = houston.join("workspaces");

    let legacy_manifest = legacy.join("workspaces.json");
    if !legacy_manifest.is_file() {
        return; // nothing to migrate
    }

    let new_manifest = new_root.join("workspaces.json");
    if new_manifest.is_file() {
        tracing::debug!(
            "[migrate] skipping — {} already has content",
            new_root.display()
        );
        return;
    }

    if let Err(e) = std::fs::create_dir_all(&new_root) {
        tracing::warn!("[migrate] create_dir_all({}) failed: {e}", new_root.display());
        return;
    }

    let entries = match std::fs::read_dir(&legacy) {
        Ok(it) => it,
        Err(e) => {
            tracing::warn!("[migrate] read_dir({}) failed: {e}", legacy.display());
            return;
        }
    };

    let mut moved = 0u32;
    for entry in entries.flatten() {
        let src = entry.path();
        let name = match src.file_name() {
            Some(n) => n.to_os_string(),
            None => continue,
        };
        let dst = new_root.join(&name);
        if dst.exists() {
            continue; // don't clobber anything at the new root
        }
        if let Err(e) = std::fs::rename(&src, &dst) {
            tracing::warn!(
                "[migrate] rename {} -> {} failed: {e}",
                src.display(),
                dst.display()
            );
            continue;
        }
        moved += 1;
    }

    if moved > 0 {
        tracing::info!(
            "[migrate] moved {moved} entries from {} to {}",
            legacy.display(),
            new_root.display()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{engine_sentry_env, sentry_send_in_dev_enabled, sentry_should_activate};

    #[test]
    fn send_in_dev_flag_off_by_default() {
        // Unset / blank / unrecognized → never opt in.
        assert!(!sentry_send_in_dev_enabled(None));
        assert!(!sentry_send_in_dev_enabled(Some("")));
        assert!(!sentry_send_in_dev_enabled(Some("   ")));
        assert!(!sentry_send_in_dev_enabled(Some("0")));
        assert!(!sentry_send_in_dev_enabled(Some("false")));
    }

    #[test]
    fn send_in_dev_flag_accepts_truthy_values() {
        for v in ["1", "true", "yes", "on", "TRUE", " On ", "Yes"] {
            assert!(sentry_send_in_dev_enabled(Some(v)), "expected {v} → true");
        }
    }

    #[test]
    fn sentry_inactive_without_dsn() {
        // No DSN → never active, regardless of build profile or opt-in.
        assert!(!sentry_should_activate(true, false, false));
        assert!(!sentry_should_activate(true, true, true));
    }

    #[test]
    fn sentry_active_in_release_with_dsn() {
        // Release build (debug = false) with a DSN → active; opt-in irrelevant.
        assert!(sentry_should_activate(false, false, false));
        assert!(sentry_should_activate(false, false, true));
    }

    #[test]
    fn sentry_suppressed_in_dev_unless_opted_in() {
        // Debug build with a DSN: suppressed by default, active only with opt-in.
        assert!(!sentry_should_activate(false, true, false));
        assert!(sentry_should_activate(false, true, true));
    }

    #[test]
    fn engine_sentry_env_empty_when_inactive() {
        // Inactive → inject NOTHING, so the engine stays dormant. The opt-in
        // flag must NOT leak through when Sentry is off.
        assert!(engine_sentry_env(false, false, "dsn", "rel", "production").is_empty());
        assert!(engine_sentry_env(false, true, "dsn", "rel", "development").is_empty());
    }

    #[test]
    fn engine_sentry_env_forwards_core_three_when_active() {
        let env = engine_sentry_env(true, false, "https://dsn", "houston-app@1.2.3", "production");
        assert_eq!(
            env,
            vec![
                ("SENTRY_DSN".to_string(), "https://dsn".to_string()),
                ("SENTRY_RELEASE".to_string(), "houston-app@1.2.3".to_string()),
                ("SENTRY_ENVIRONMENT".to_string(), "production".to_string()),
            ]
        );
        // No opt-in flag unless the app itself opted in.
        assert!(!env.iter().any(|(k, _)| k == "SENTRY_SEND_IN_DEV"));
    }

    #[test]
    fn engine_sentry_env_forwards_send_in_dev_when_opted_in() {
        // The symmetric invariant: opting in injects the DSN AND the flag, so
        // the debug engine sidecar's own dev gate agrees instead of suppressing.
        let env =
            engine_sentry_env(true, true, "https://dsn", "houston-app@1.2.3-dev", "development");
        assert!(env.contains(&("SENTRY_SEND_IN_DEV".to_string(), "1".to_string())));
        assert!(env.iter().any(|(k, _)| k == "SENTRY_DSN"));
        assert!(env.iter().any(|(k, _)| k == "SENTRY_ENVIRONMENT"));
    }
}
