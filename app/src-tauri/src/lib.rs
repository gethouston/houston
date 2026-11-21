mod appimage_env;
mod auth;
mod bug_report;
mod child_guard;
#[cfg_attr(not(windows), allow(dead_code))]
mod git_bash;
mod claude_login;
mod channels_loopback;
mod codex_oauth_loopback;
mod commands;
mod deep_link_register;
mod dictation;
#[cfg(target_os = "macos")]
mod dmg_guard;
mod engine_supervisor;
mod houston_prompt;
mod local_bridge;
mod logging;
mod loopback_util;
mod notification;
mod notification_settings;
mod oauth_loopback;
mod powershell_path;
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
mod redirection_guard;
mod sentry_filter;
mod shell_env;
mod window_focus;
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
mod window_preflight;
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
mod webview_guard;
mod windows_icon_repair;

use engine_supervisor::{
    reserve_free_port, resolve_engine_binary, spawn_supervisor, wait_until_host_healthy,
    EngineHandshake, SupervisorCallbacks,
};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

/// Resolve Houston's data root: `~/.houston/` for release builds, `~/.dev-houston/`
/// for debug builds so `pnpm tauri dev` stays isolated from an installed release.
/// `HOUSTON_HOME` overrides both. Inlined here when the Rust engine crates (which
/// previously owned `houston_db::db::houston_dir`) were removed.
pub(crate) fn houston_dir() -> PathBuf {
    if let Ok(override_path) = std::env::var("HOUSTON_HOME") {
        return PathBuf::from(override_path);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let subdir = if cfg!(debug_assertions) {
        ".dev-houston"
    } else {
        ".houston"
    };
    home.join(subdir)
}

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

/// Supervisor callback that notifies the frontend on each engine restart
/// (the frontend surfaces the reconnect toast).
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

/// Env pairs carrying the signed-in user's identity into the engine, parsed
/// from the persisted session blob the frontend writes to the auth store
/// (`app/src/lib/identity/session.ts` — uid/email/displayName). The engine
/// stamps them on its Sentry events so engine crashes are attributable to a
/// user exactly like renderer crashes already are. Absent or unparseable
/// session → no identity env (fresh install, signed out, or dev's
/// localStorage-mode auth). A first-ever sign-in mid-session reaches the
/// engine on the next launch. Pure for testability.
fn engine_identity_env(session_json: Option<&str>) -> Vec<(String, String)> {
    let Some(raw) = session_json else {
        return Vec::new();
    };
    let Ok(session) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    let mut env = Vec::new();
    for (key, field) in [
        ("HOUSTON_USER_ID", "uid"),
        ("HOUSTON_USER_EMAIL", "email"),
        ("HOUSTON_USER_NAME", "displayName"),
    ] {
        if let Some(value) = session[field].as_str().filter(|v| !v.is_empty()) {
            env.push((key.to_string(), value.to_string()));
        }
    }
    env
}

pub fn run() {
    commands::os::stamp_launch_t0();

    #[cfg(target_os = "macos")]
    dmg_guard::handle_if_needed();

    redirection_guard::relaunch_if_inherited();

    let houston = houston_dir();

    let sentry_dsn = option_env!("SENTRY_DSN").unwrap_or("");
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
    let sentry_send_in_dev = sentry_send_in_dev_enabled(option_env!("SENTRY_SEND_IN_DEV"));
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

    logging::init(&houston);
    redirection_guard::report_after_logging_init();

    window_preflight::ensure_window_creation_works();

    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tracing::info!("[single-instance] secondary launch routed to primary");
            window_focus::bring_to_front(app);
        }));
    }

    if let Some(ref client) = _sentry_client {
        builder = builder.plugin(tauri_plugin_sentry::init(client));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                commands::update_stage::prune_abandoned_partials(&handle);
            });
            #[cfg(target_os = "windows")]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    tracing::warn!(
                        "[deep-link] runtime houston:// registration failed — \
                         Apple sign-in won't reach this install: {e}"
                    );
                }
            }
            #[cfg(target_os = "linux")]
            deep_link_register::register(app.handle());

            #[cfg(target_os = "windows")]
            windows_icon_repair::spawn_repair(app.package_info().version.to_string());
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        if auth::is_auth_callback_deep_link(url.as_str())
                            || auth::is_plan_settings_deep_link(url.as_str())
                            || auth::is_channels_settings_deep_link(url.as_str())
                            || auth::is_linkedin_settings_deep_link(url.as_str())
                        {
                            auth::emit_deep_link(&handle, url.as_str());
                        }
                    }
                    window_focus::bring_to_front(&handle);
                });
            }

            app.manage(oauth_loopback::OauthLoopbackState::default());
            app.manage(channels_loopback::ChannelsLoopbackState::default());

            app.manage(claude_login::ClaudeLoginState::default());

            app.manage(commands::migration::MigrationSourceState::default());

            let houston = houston_dir();

            migrate_legacy_docs_dir(&houston);

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
                tracing::info!("[host] remote host mode — skipping the local host sidecar");
                app.manage(EngineHandshakeState::default());
            } else {
                spawn_host_sidecar(
                    app,
                    &houston,
                    sentry_active,
                    sentry_send_in_dev,
                    sentry_dsn,
                    &sentry_release,
                    sentry_environment,
                );
            }

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
            commands::os::launch_t0_ms,
            commands::os::open_url,
            commands::os::open_file,
            commands::os::reveal_file,
            commands::os::reveal_agent,
            commands::os::reveal_path,
            commands::portable::open_portable_agent,
            commands::migration::detect_legacy_houston,
            commands::migration::backup_houston_data,
            commands::migration::start_migration_source_host,
            commands::migration::stop_migration_source_host,
            commands::save_file::save_download,
            commands::update::current_app_bundle_path,
            commands::update::relaunch_app_from_path,
            commands::update_stage::download_update,
            commands::update_stage::install_update,
            commands::diagnostics::sentry_native_stack_smoke_test,
            logging::write_frontend_log,
            logging::read_recent_logs,
            notification::show_session_notification,
            notification_settings::open_notification_settings,
            bug_report::report_bug,
            get_engine_handshake,
            auth::auth_get_item,
            auth::auth_set_item,
            auth::auth_remove_item,
            oauth_loopback::start_oauth_loopback,
            oauth_loopback::cancel_oauth_loopback,
            channels_loopback::start_channels_loopback,
            channels_loopback::cancel_channels_loopback,
            codex_oauth_loopback::start_codex_oauth_loopback,
            claude_login::start_claude_login,
            claude_login::cancel_claude_login,
            claude_login::code_input::submit_claude_login_code,
            claude_login::code_input::complete_claude_login_from_clipboard,
            claude_login::credential::read_claude_credential,
            claude_login::discard::discard_claude_handoff_credential,
            window_focus::focus_main_window,
            local_bridge::commands::detect_local_models,
            local_bridge::commands::start_local_bridge,
            local_bridge::commands::stop_local_bridge,
            local_bridge::commands::saved_bridge_target,
            local_bridge::commands::local_bridge_device,
            local_bridge::commands::save_bridge_target,
            local_bridge::commands::forget_bridge_target,
            local_bridge::commands::renew_local_bridge,
            local_bridge::legacy::local_bridge_legacy_candidate,
            local_bridge::legacy::local_bridge_complete_migration,
            dictation::transcribe_audio,
            dictation::dictation_model_status,
            dictation::download_dictation_model,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                #[cfg(target_os = "windows")]
                tauri::RunEvent::Ready => {
                    webview_guard::enforce::ensure_main_webview(app_handle);
                }
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
                tauri::RunEvent::Exit => {
                    engine_supervisor::mark_shutting_down();
                    local_bridge::shutdown();
                }
                _ => {}
            }
        });
}

fn integrations_host_env(
    runtime_url: Option<String>,
    runtime_key: Option<String>,
    baked_url: Option<&str>,
) -> Vec<(String, String)> {
    let runtime_url = runtime_url.filter(|value| !value.is_empty());
    let runtime_key = runtime_key.filter(|value| !value.is_empty());
    let mut env = Vec::new();
    if let Some(url) = runtime_url {
        env.push(("HOUSTON_INTEGRATIONS_URL".into(), url));
    } else if runtime_key.is_none() {
        if let Some(url) = baked_url.filter(|value| !value.is_empty()) {
            env.push(("HOUSTON_INTEGRATIONS_URL".into(), url.into()));
        }
    }
    if let Some(key) = runtime_key {
        env.push(("COMPOSIO_API_KEY".into(), key));
    }
    env
}

/// Spawn the Bun-compiled Houston host as the sidecar and drive the frontend
/// into control-plane mode against it.
///
///   - hands the host its OWN env contract: `HOUSTON_HOME` (so every host
///     default — agents dir, chat-history db — roots at the same data dir as
///     the shell, `~/.dev-houston` in debug builds), `HOUSTON_WORKSPACES_ROOT`,
///     `HOUSTON_CREDENTIALS_PATH`, a reserved `HOUSTON_HOST_PORT`, and the
///     product voice via `HOUSTON_APP_SYSTEM_PROMPT` (read by
///     packages/host/src/local/main.ts). The host mints its OWN
///     crypto-strong per-boot token (`randomBytes(32)`) and echoes it in the
///     `HOUSTON_HOST_LISTENING` banner — we read it back rather than minting a
///     weaker one in Rust, so the handshake token is still random per boot.
///   - parses the host banner (`engine_supervisor::parse_banner`).
///   - health-checks the host's `/health`.
///   - injects `window.__HOUSTON_CP__ = true` ALONGSIDE the `__HOUSTON_ENGINE__`
///     handshake, so `app/src/lib/engine.ts` runs the control-plane adapter
///     against the sidecar — the runtime equivalent of setting
///     `VITE_NEW_ENGINE_URL`, but pointed at our own spawned host.
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
    let binary = resolve_engine_binary(resource_dir.as_ref())
        .expect("houston host binary missing — check externalBin bundling / run scripts/build-host-sidecar.sh");
    tracing::info!("[host] spawning sidecar {}", binary.display());

    let port = reserve_free_port().expect("could not reserve a loopback port for the host sidecar");

    let workspaces_root = houston.join("workspaces");
    let credentials_path = houston.join("credentials.json");

    let mut host_env: Vec<(String, String)> = vec![
        ("HOUSTON_HOME".into(), houston.display().to_string()),
        (
            "HOUSTON_WORKSPACES_ROOT".into(),
            workspaces_root.display().to_string(),
        ),
        (
            "HOUSTON_CREDENTIALS_PATH".into(),
            credentials_path.display().to_string(),
        ),
        ("HOUSTON_HOST_PORT".into(), port.to_string()),
        (
            "HOUSTON_APP_SYSTEM_PROMPT".into(),
            houston_prompt::system_prompt_pi(),
        ),
    ];
    host_env.extend(integrations_host_env(
        std::env::var("HOUSTON_INTEGRATIONS_URL").ok(),
        std::env::var("COMPOSIO_API_KEY").ok(),
        option_env!("HOUSTON_INTEGRATIONS_URL"),
    ));
    host_env.extend(engine_sentry_env(
        sentry_active,
        sentry_send_in_dev,
        sentry_dsn,
        sentry_release,
        sentry_environment,
    ));
    if sentry_active {
        host_env.extend(engine_identity_env(
            auth::stored_session_json().as_deref(),
        ));
    }

    let cb: Arc<TauriSupervisorCallbacks> = Arc::new(TauriSupervisorCallbacks {
        handle: app.handle().clone(),
    });
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

    let handshake_state = EngineHandshakeState::default();
    *handshake_state.0.lock().unwrap() = Some(handshake.clone());
    app.manage(handshake_state);

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
        return;
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
        tracing::warn!(
            "[migrate] create_dir_all({}) failed: {e}",
            new_root.display()
        );
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
            continue;
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
    use super::{
        engine_identity_env, engine_sentry_env, integrations_host_env, sentry_send_in_dev_enabled,
        sentry_should_activate,
    };

    const BAKED_INTEGRATIONS_URL: &str = "https://integrations.houston.test";

    #[test]
    fn integrations_env_runtime_url_and_key_forwards_both() {
        assert_eq!(
            integrations_host_env(
                Some("https://runtime.test".into()),
                Some("own-key".into()),
                Some(BAKED_INTEGRATIONS_URL),
            ),
            vec![
                (
                    "HOUSTON_INTEGRATIONS_URL".into(),
                    "https://runtime.test".into(),
                ),
                ("COMPOSIO_API_KEY".into(), "own-key".into()),
            ]
        );
    }

    #[test]
    fn integrations_env_runtime_url_without_key_forwards_url() {
        assert_eq!(
            integrations_host_env(
                Some("https://runtime.test".into()),
                None,
                Some(BAKED_INTEGRATIONS_URL),
            ),
            vec![(
                "HOUSTON_INTEGRATIONS_URL".into(),
                "https://runtime.test".into(),
            )]
        );
    }

    #[test]
    fn integrations_env_runtime_key_without_url_opts_into_direct_mode() {
        assert_eq!(
            integrations_host_env(None, Some("own-key".into()), Some(BAKED_INTEGRATIONS_URL)),
            vec![("COMPOSIO_API_KEY".into(), "own-key".into())]
        );
    }

    #[test]
    fn integrations_env_without_runtime_values_uses_baked_url() {
        assert_eq!(
            integrations_host_env(None, None, Some(BAKED_INTEGRATIONS_URL)),
            vec![(
                "HOUSTON_INTEGRATIONS_URL".into(),
                BAKED_INTEGRATIONS_URL.into(),
            )]
        );
    }

    #[test]
    fn integrations_env_treats_empty_values_as_unset() {
        assert_eq!(
            integrations_host_env(
                Some(String::new()),
                Some(String::new()),
                Some(BAKED_INTEGRATIONS_URL),
            ),
            vec![(
                "HOUSTON_INTEGRATIONS_URL".into(),
                BAKED_INTEGRATIONS_URL.into(),
            )]
        );
        assert_eq!(
            integrations_host_env(
                Some(String::new()),
                Some("own-key".into()),
                Some(BAKED_INTEGRATIONS_URL),
            ),
            vec![("COMPOSIO_API_KEY".into(), "own-key".into())]
        );
        assert_eq!(
            integrations_host_env(None, None, Some("")),
            Vec::<(String, String)>::new()
        );
    }

    #[test]
    fn send_in_dev_flag_off_by_default() {
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
        assert!(!sentry_should_activate(true, false, false));
        assert!(!sentry_should_activate(true, true, true));
    }

    #[test]
    fn sentry_active_in_release_with_dsn() {
        assert!(sentry_should_activate(false, false, false));
        assert!(sentry_should_activate(false, false, true));
    }

    #[test]
    fn sentry_suppressed_in_dev_unless_opted_in() {
        assert!(!sentry_should_activate(false, true, false));
        assert!(sentry_should_activate(false, true, true));
    }

    #[test]
    fn engine_identity_env_parses_the_session_blob() {
        let env = engine_identity_env(Some(
            r#"{"uid":"abc123","email":"felipe@example.com","displayName":"Felipe","idToken":"x"}"#,
        ));
        assert_eq!(
            env,
            vec![
                ("HOUSTON_USER_ID".to_string(), "abc123".to_string()),
                (
                    "HOUSTON_USER_EMAIL".to_string(),
                    "felipe@example.com".to_string()
                ),
                ("HOUSTON_USER_NAME".to_string(), "Felipe".to_string()),
            ]
        );
    }

    #[test]
    fn engine_identity_env_skips_missing_and_null_fields() {
        let env = engine_identity_env(Some(r#"{"uid":"abc123","displayName":null}"#));
        assert_eq!(
            env,
            vec![("HOUSTON_USER_ID".to_string(), "abc123".to_string())]
        );
    }

    #[test]
    fn engine_identity_env_empty_on_absent_or_garbage_session() {
        assert!(engine_identity_env(None).is_empty());
        assert!(engine_identity_env(Some("not json")).is_empty());
        assert!(engine_identity_env(Some("[]")).is_empty());
    }

    #[test]
    fn engine_sentry_env_empty_when_inactive() {
        assert!(engine_sentry_env(false, false, "dsn", "rel", "production").is_empty());
        assert!(engine_sentry_env(false, true, "dsn", "rel", "development").is_empty());
    }

    #[test]
    fn engine_sentry_env_forwards_core_three_when_active() {
        let env = engine_sentry_env(
            true,
            false,
            "https://dsn",
            "houston-app@1.2.3",
            "production",
        );
        assert_eq!(
            env,
            vec![
                ("SENTRY_DSN".to_string(), "https://dsn".to_string()),
                (
                    "SENTRY_RELEASE".to_string(),
                    "houston-app@1.2.3".to_string()
                ),
                ("SENTRY_ENVIRONMENT".to_string(), "production".to_string()),
            ]
        );
        assert!(!env.iter().any(|(k, _)| k == "SENTRY_SEND_IN_DEV"));
    }

    #[test]
    fn engine_sentry_env_forwards_send_in_dev_when_opted_in() {
        let env = engine_sentry_env(
            true,
            true,
            "https://dsn",
            "houston-app@1.2.3-dev",
            "development",
        );
        assert!(env.contains(&("SENTRY_SEND_IN_DEV".to_string(), "1".to_string())));
        assert!(env.iter().any(|(k, _)| k == "SENTRY_DSN"));
        assert!(env.iter().any(|(k, _)| k == "SENTRY_ENVIRONMENT"));
    }
}
