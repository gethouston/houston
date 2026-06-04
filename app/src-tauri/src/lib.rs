mod auth;
mod bug_report;
mod commands;
#[cfg(target_os = "macos")]
mod dmg_guard;
mod engine_supervisor;
mod houston_prompt;
mod logging;
mod notification;

use engine_supervisor::{
    resolve_engine_binary, spawn_supervisor, wait_until_healthy, EngineHandshake,
    SupervisorCallbacks,
};
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
    let _sentry_client = if sentry_dsn.is_empty() {
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
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
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
                        auth::emit_deep_link(&handle, url.as_str());
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

            // AppState keeps a DB handle for any OS-native lookup (log
            // reading, session search). Domain state now lives in the
            // engine subprocess.
            app.manage(AppState {
                db,
                event_queue: None,
                scheduler: None,
            });

            // Register the engine-handshake cell up front, empty. The
            // `get_engine_handshake` command reads it and the background
            // bring-up thread (below) fills it once /v1/health passes; until
            // then the frontend's `pullHandshakeWithRetry` keeps polling.
            app.manage(EngineHandshakeState::default());

            // Size the window to 80% of the screen NOW — it is independent of
            // engine state, so doing it here means the `EngineGate` splash
            // paints at the right size the instant the run loop starts (see
            // the background bring-up just below for why nothing here blocks).
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let screen = monitor.size();
                    let scale = monitor.scale_factor();
                    let w = (screen.width as f64 / scale * 0.80) as f64;
                    let h = (screen.height as f64 / scale * 0.80) as f64;
                    if let Err(e) = window.set_size(tauri::LogicalSize::new(w, h)) {
                        tracing::warn!("[app] failed to size main window: {e}");
                    }
                    if let Err(e) = window.center() {
                        tracing::warn!("[app] failed to center main window: {e}");
                    }
                }
            }

            // --- Bring up houston-engine OFF the main thread ----------------
            //
            // Tauri runs this `setup` closure on the main/UI thread BEFORE the
            // event loop starts pumping, and on macOS a window cannot paint
            // until that run loop runs. Engine bring-up — resolve the sidecar,
            // read its banner (up to 30s), poll `/v1/health` (up to 30s) —
            // plus the one-time data migrations can take tens of seconds on
            // the first launch after an update: the freshly-replaced notarized
            // sidecar triggers a macOS Gatekeeper re-scan and claude-code
            // re-installs. Doing that work here froze the window on a blank
            // frame long enough that macOS flagged Houston "not responding";
            // users force-quit, and the next launch showed the "force quit
            // while reopening windows" dialog (gethouston/houston#439).
            //
            // So hand it all to a worker thread and return immediately. The
            // window paints the `EngineGate` splash right away; the thread
            // emits `houston-engine-ready` (or `houston-engine-failed`) when
            // it finishes. The 30s timeouts stay — off the main thread they
            // are harmless, and they still cover the Windows first-launch path
            // (PortableGit extraction) that #125 widened them for.
            let app_handle = app.handle().clone();
            let resource_dir = app.path().resource_dir().ok();
            let sentry_dsn = sentry_dsn.to_string();
            let sentry_release = sentry_release.clone();
            let sentry_environment = sentry_environment.to_string();
            std::thread::Builder::new()
                .name("engine-bringup".into())
                .spawn(move || {
                    bring_up_engine(
                        app_handle,
                        houston,
                        resource_dir,
                        sentry_dsn,
                        sentry_release,
                        sentry_environment,
                    );
                })
                .expect("failed to spawn engine bring-up thread");

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
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                // App-level activation (cmd+tab, dock click, etc.)
                tauri::RunEvent::Resumed => {
                    tracing::info!("[app] RunEvent::Resumed — bringing window to front");
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
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

/// Bring up the `houston-engine` subprocess on a worker thread.
///
/// Runs the one-time data migrations, spawns the engine via the supervisor,
/// waits for `/v1/health`, then stashes the handshake, injects
/// `window.__HOUSTON_ENGINE__`, and emits `houston-engine-ready`. On any
/// failure it reports to Sentry and emits `houston-engine-failed` so the
/// frontend `EngineGate` shows an actionable error (with a Report-bug button)
/// instead of an endless splash.
///
/// This MUST NOT run on the Tauri `setup` (main/UI) thread: on macOS the
/// window cannot paint until the run loop starts, so blocking the main thread
/// for the tens of seconds bring-up can take on a post-update first launch is
/// what made macOS mark Houston "not responding" (gethouston/houston#439).
fn bring_up_engine(
    app: tauri::AppHandle,
    houston: std::path::PathBuf,
    resource_dir: Option<std::path::PathBuf>,
    sentry_dsn: String,
    sentry_release: String,
    sentry_environment: String,
) {
    // One-time migrations (idempotent). Run before the engine starts — it
    // reads the migrated `workspaces/` tree.
    //
    // Legacy: earlier versions stored workspaces under `~/Documents/Houston/`;
    // the new default is `$HOUSTON_HOME/workspaces/`. Then eagerly run the
    // intra-agent data-layout migration on every agent the user already has,
    // so upgraders who only BROWSE the Activity tab still see their data
    // instead of an empty board.
    migrate_legacy_docs_dir(&houston);
    migrate_all_agents(&houston.join("workspaces"));

    let resource_dir_ref = resource_dir.as_ref();
    let binary = match resolve_engine_binary(resource_dir_ref) {
        Ok(b) => b,
        Err(e) => return fail_engine_startup(&app, format!("engine binary missing: {e}")),
    };
    tracing::info!("[engine] spawning {}", binary.display());

    let cb: Arc<TauriSupervisorCallbacks> = Arc::new(TauriSupervisorCallbacks {
        handle: app.clone(),
    });

    // Product-layer prompts live in `houston_prompt` and are exported to the
    // engine via env vars; the engine treats them as opaque strings. Pin
    // HOUSTON_HOME + HOUSTON_DOCS so the engine uses the app's data roots.
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
    if let Some(store_dir) = resource_dir_ref
        .map(|dir| dir.join("store"))
        .filter(|dir| dir.join("catalog.json").exists())
    {
        engine_env.push(("HOUSTON_STORE_DIR".into(), store_dir.display().to_string()));
    }
    // If a Supabase session is already persisted in Keychain, stamp the
    // subprocess with the user_id (opaque to the engine). Local/ad-hoc builds
    // compile auth storage in browser mode, so this returns before Keychain.
    if let Some(user_id) = auth::persisted_user_id() {
        engine_env.push(("HOUSTON_APP_USER_ID".into(), user_id));
    }
    // Pass through `HOUSTON_TUNNEL_URL` for local relay dev; production uses
    // the engine's baked-in default (`tunnel.gethouston.ai`).
    if let Ok(v) = std::env::var("HOUSTON_TUNNEL_URL") {
        if !v.is_empty() {
            engine_env.push(("HOUSTON_TUNNEL_URL".into(), v));
        }
    }
    // Hand our Sentry config to the engine so engine-side panics land in the
    // SAME project/release tagged `runtime=engine`. Gated on a real DSN so
    // forks / dev builds inject nothing.
    if !sentry_dsn.is_empty() {
        engine_env.push(("SENTRY_DSN".into(), sentry_dsn));
        engine_env.push(("SENTRY_RELEASE".into(), sentry_release));
        engine_env.push(("SENTRY_ENVIRONMENT".into(), sentry_environment));
    }

    // 30s banner timeout: a first-run Gatekeeper scan on a notarized sidecar
    // can take 15-20s on slow machines. Off the main thread this no longer
    // blocks the window from painting.
    let slot = match spawn_supervisor(binary, Duration::from_secs(30), engine_env, cb) {
        Ok(slot) => slot,
        Err(e) => return fail_engine_startup(&app, format!("failed to spawn engine: {e}")),
    };
    let handshake = {
        let guard = match slot.lock() {
            Ok(g) => g,
            Err(_) => return fail_engine_startup(&app, "engine slot poisoned".into()),
        };
        match guard.as_ref() {
            Some(s) => s.handshake.clone(),
            None => {
                return fail_engine_startup(&app, "engine subprocess missing after spawn".into())
            }
        }
    };

    // 30s health budget. On first launch the engine imports bundled certs,
    // runs a login-shell PATH probe, and (on Windows) kicks off PortableGit
    // extraction. #125 widened this from 5s to break a Windows crash loop.
    if let Err(e) = wait_until_healthy(&handshake, Duration::from_secs(30)) {
        return fail_engine_startup(&app, format!("engine did not pass /v1/health: {e}"));
    }

    // Stash the handshake so `get_engine_handshake` can serve it (the cell was
    // managed on the main thread before this worker was spawned), then deliver
    // it to the webview two ways — `window.eval` for the fast path and the
    // `houston-engine-ready` event for the `EngineGate` listener.
    let handshake_state = app.state::<EngineHandshakeState>();
    match handshake_state.0.lock() {
        Ok(mut guard) => *guard = Some(handshake.clone()),
        Err(e) => tracing::error!("[engine] handshake state mutex poisoned: {e}"),
    }

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

/// Report a fatal engine-startup failure to Sentry and tell the frontend so
/// `EngineGate` can render an actionable error (with a Report-bug button)
/// instead of an endless splash.
///
/// We deliberately do NOT exit the process: a hard exit during launch is
/// exactly what re-triggers macOS's "reopen windows" dialog (#439), which is
/// the symptom we are fixing.
fn fail_engine_startup(app: &tauri::AppHandle, reason: String) {
    tracing::error!("[engine] startup failed: {reason}");
    sentry::with_scope(
        |scope| {
            scope.set_tag("runtime", "engine-supervisor");
            scope.set_tag("source", "engine_startup_failed");
            scope.set_fingerprint(Some(&["engine-startup-failed"][..]));
        },
        || {
            sentry::capture_message(
                &format!("houston-engine failed to start: {reason}"),
                sentry::Level::Error,
            );
        },
    );
    if let Err(e) = app.emit("houston-engine-failed", engine_failed_payload(&reason)) {
        tracing::error!("[engine] failed to emit failure event: {e}");
    }
}

/// Payload for the `houston-engine-failed` event. Kept as a tiny pure helper
/// so the wire shape the frontend depends on (`engine.ts`) stays under test.
fn engine_failed_payload(reason: &str) -> serde_json::Value {
    serde_json::json!({ "reason": reason })
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
    use super::*;

    #[test]
    fn engine_failed_payload_carries_reason() {
        // The frontend `houston-engine-failed` listener (app/src/lib/engine.ts)
        // reads the `reason` field. Lock the wire key so a rename here can't
        // silently break the EngineGate error screen.
        let payload = engine_failed_payload("engine did not pass /v1/health");
        assert_eq!(payload["reason"], "engine did not pass /v1/health");
    }
}
