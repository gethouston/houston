/**
 * Every Tauri command `app/src` may invoke, and why it is native.
 *
 * The rule this list encodes: desktop code bypasses `@houston/sdk` ONLY for a
 * capability that is a property of THIS MACHINE rather than of Houston, namely
 * the OS shell, the keychain, the updater, an OAuth loopback listener, the
 * local-model bridge transport, on-device dictation and local diagnostics.
 * Anything whose answer would be the same on a remote VPS is an SDK method,
 * because the engine may run on one.
 *
 * A source module, not a fixture: `os-bridge.ts` types its `invoke` calls
 * against {@link DesktopNativeCommand}, so a command invoked without an entry
 * here fails the typecheck rather than only a gate. The gate
 * (`scripts/check-desktop-native.mjs`) then cross-checks this list against the
 * Rust `generate_handler!` block and the web shim, in both directions.
 */

/** Which machine-local capability a command reaches. */
export type DesktopNativeCategory =
  | "os"
  | "keychain"
  | "updater"
  | "oauth-loopback"
  | "local-bridge"
  | "dictation"
  | "diagnostics";

/**
 * `[command, category, why it is native]`, grouped by category. The reason is
 * what a reviewer judges a NEW entry on: it must name a machine-local fact,
 * never a convenience.
 */
export const DESKTOP_NATIVE_COMMANDS = [
  // OS shell: this machine's file manager, browser, windows and disk.
  ["open_url", "os", "hands a URL to the default browser"],
  ["open_file", "os", "opens a file with its default app"],
  ["reveal_file", "os", "shows a file in Finder/Explorer"],
  ["reveal_agent", "os", "shows an agent folder in Finder/Explorer"],
  ["reveal_path", "os", "shows any absolute path in Finder/Explorer"],
  ["save_download", "os", "native Save as; the webview ignores downloads"],
  ["open_portable_agent", "os", "native Open for an agent file on disk"],
  ["focus_main_window", "os", "pulls the window to the front"],
  ["show_session_notification", "os", "an OS notification with a click target"],
  ["open_notification_settings", "os", "the OS notification-permission pane"],
  [
    "get_engine_handshake",
    "os",
    "where the sidecar this shell spawned listens",
  ],
  ["detect_legacy_houston", "os", "scans this disk for a previous install"],
  ["backup_houston_data", "os", "copies the local tree before migrating it"],
  [
    "start_migration_source_host",
    "os",
    "runs a host over the legacy local tree",
  ],
  ["stop_migration_source_host", "os", "kills that migration-source host"],

  // Keychain / DPAPI: secrets that must never leave this machine.
  ["auth_get_item", "keychain", "reads the identity session blob"],
  ["auth_set_item", "keychain", "writes the identity session blob"],
  ["auth_remove_item", "keychain", "drops the identity session blob"],
  [
    "read_claude_credential",
    "keychain",
    "reads what the local claude CLI cached",
  ],
  ["discard_claude_handoff_credential", "keychain", "destroys that local copy"],

  // Updater: replaces the running bundle, which only the shell can do.
  ["current_app_bundle_path", "updater", "resolves the bundle before it moves"],
  ["download_update", "updater", "resumable download plus signature check"],
  ["install_update", "updater", "installs the staged release bytes"],
  ["relaunch_app_from_path", "updater", "relaunches the installed app"],

  // OAuth loopback: a listener only this machine's browser can reach.
  ["start_oauth_loopback", "oauth-loopback", "binds the sign-in redirect port"],
  [
    "cancel_oauth_loopback",
    "oauth-loopback",
    "frees it on an abandoned attempt",
  ],
  ["start_codex_oauth_loopback", "oauth-loopback", "binds OpenAI's fixed port"],
  [
    "start_claude_login",
    "oauth-loopback",
    "runs the claude CLI's sign-in here",
  ],
  ["cancel_claude_login", "oauth-loopback", "kills that sign-in child process"],
  ["submit_claude_login_code", "oauth-loopback", "relays a code to its stdin"],
  [
    "complete_claude_login_from_clipboard",
    "oauth-loopback",
    "finishes a stuck sign-in from this machine's clipboard",
  ],

  // Local-model bridge: outbound transport to a server on this machine/LAN.
  ["detect_local_models", "local-bridge", "probes localhost for model servers"],
  ["local_bridge_device", "local-bridge", "this device's bridge identity"],
  ["local_bridge_legacy_candidate", "local-bridge", "a pre-journal target"],
  ["local_bridge_complete_migration", "local-bridge", "marks adoption done"],
  ["start_local_bridge", "local-bridge", "opens the outbound bridge tunnel"],
  ["renew_local_bridge", "local-bridge", "renews the bridge ticket"],
  ["saved_bridge_target", "local-bridge", "reads the secure device journal"],
  ["save_bridge_target", "local-bridge", "writes the secure device journal"],
  ["forget_bridge_target", "local-bridge", "erases the secure device journal"],
  ["stop_local_bridge", "local-bridge", "closes the outbound bridge tunnel"],

  // Dictation: transcription runs entirely on this machine.
  ["transcribe_audio", "dictation", "whisper.cpp sidecar transcription"],
  ["dictation_model_status", "dictation", "is the pinned model on this disk"],
  ["download_dictation_model", "dictation", "fetches and verifies that model"],

  // Diagnostics: local logs and native crash reporting.
  ["write_frontend_log", "diagnostics", "appends to the local frontend log"],
  [
    "read_recent_logs",
    "diagnostics",
    "tails the local backend + frontend logs",
  ],
  ["report_bug", "diagnostics", "native intake; keeps Linear creds out of JS"],
  [
    "sentry_native_stack_smoke_test",
    "diagnostics",
    "panics natively on purpose",
  ],
  ["launch_t0_ms", "diagnostics", "the shell's process-start stamp for spans"],
] as const satisfies readonly (readonly [
  string,
  DesktopNativeCategory,
  string,
])[];

/** Every command name `os-bridge.ts` is allowed to invoke. */
export type DesktopNativeCommand = (typeof DESKTOP_NATIVE_COMMANDS)[number][0];
