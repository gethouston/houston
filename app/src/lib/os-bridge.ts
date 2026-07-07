/**
 * OS-native Tauri IPC bridge.
 *
 * Post-Phase-4 this module is the ONLY place in `app/src/` that may call
 * `invoke(...)`. Two classes of calls live here:
 *
 *  1. **OS-native helpers** (`osRevealFile`, `osPickDirectory`, …). These
 *     probe the user's local machine (file manager, open URL, terminal, local
 *     Claude CLI, local log writes) and will NEVER move to the engine —
 *     the engine may run on a remote VPS.
 *
 *  2. **Local Tauri events** (`legacyListen`, `legacyEmit`). Used by
 *     `events.ts` for events that never leave the desktop process —
 *     e.g. `app-activated` (OS window resume).
 *
 * Invariant enforced by CI: `grep -rn "invoke(" app/src/` only matches
 * this file.
 */

import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  type Event,
  emit,
  listen,
  type UnlistenFn,
} from "@tauri-apps/api/event";
import type {
  DictationModelProgress,
  DictationModelStatus,
} from "./dictation/types";
import type {
  BridgeStatus,
  DetectedServer,
  ReconnectBridgeArgs,
  SavedBridgeTarget,
  StartBridgeArgs,
  StartBridgeResult,
} from "./local-model";

// ── Platform detection ────────────────────────────────────────────────

/**
 * True when running inside the Tauri desktop shell, false in a plain
 * browser (the webapp / mobile PWA pointed at a remote engine).
 *
 * This is the load-bearing distinction for provider sign-in: only the
 * desktop app is co-located with its engine, so only there can a
 * provider CLI's `localhost` OAuth callback reach the user's browser.
 * Remote clients must request the headless device-code flow instead
 * (see the AI hub's `use-provider-connections`). Delegates to
 * `@tauri-apps/api`'s blessed check (the global `isTauri` flag the
 * webview sets) rather than poking internals ourselves.
 */
export function osIsTauri(): boolean {
  return isTauri();
}

// ── Local Tauri events (non-domain) ──────────────────────────────────

export function legacyListen<T>(
  event: string,
  handler: (ev: Event<T>) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, handler);
}

export function legacyEmit(event: string, payload?: unknown): Promise<void> {
  return emit(event, payload);
}

// ── OS-native helpers ─────────────────────────────────────────────────

/** macOS folder picker (osascript). */
export function osPickDirectory(): Promise<string | null> {
  return invoke<string | null>("pick_directory");
}

/** Open a URL in the user's default browser. */
export function osOpenUrl(url: string): Promise<void> {
  return invoke<void>("open_url", { url });
}

/** Start a one-shot localhost listener for the Google OAuth redirect and
 * return the `redirectTo` URI Supabase should bounce the browser to. Keeps
 * desktop sign-in entirely on the user's machine — no website relay, no
 * custom-scheme "open app?" dialog. Desktop only; web/PWA clients have no
 * local listener and use the https relay bridge instead. */
export function osStartOauthLoopback(): Promise<string> {
  return invoke<string>("start_oauth_loopback");
}

/** Bind a one-shot localhost listener for the Codex/OpenAI OAuth redirect. On
 * success the native side emits `codex-oauth://callback` with the raw
 * `code=...&state=...` query string once OpenAI bounces the browser back;
 * rejects with a message string if the port can't be bound. Desktop only, and
 * only used against a REMOTE engine (pi's own 1455 is in the pod, so binding a
 * LOCAL 1455 can't collide) — keeps ChatGPT sign-in zero-code even remotely.
 * Mirrors {@link osStartOauthLoopback} (the Supabase Google loopback). */
export function osStartCodexOauthLoopback(): Promise<void> {
  return invoke<void>("start_codex_oauth_loopback");
}

/** Run `claude auth login --claudeai` FOR the user on the desktop (zero
 * terminal): the native side spawns the bundled `claude`, which opens the
 * browser and catches its own callback, caching the credential in Houston's
 * shared login dir (the same `CLAUDE_CONFIG_DIR` the engine reads). Emits
 * `claude-login://url` (the authorize URL, as a fallback for the "didn't open"
 * link) and `claude-login://done` (`{ success, error }`). Rejects only on an
 * up-front spawn failure. Desktop + co-located engine only. */
export function osStartClaudeLogin(): Promise<void> {
  return invoke<void>("start_claude_login");
}

/** Extract the Anthropic OAuth credential the `claude` CLI just cached for
 * Houston's shared login dir, as the CLI's `.credentials.json` JSON string
 * (`{claudeAiOauth:{...}}`). Used ONLY for a REMOTE engine: the desktop pushes
 * the extracted cred to the pod (which can't read this machine's Keychain). The
 * native side reads `<claudeLoginConfigDir>/.credentials.json` or, on macOS, the
 * `"Claude Code-credentials"` Keychain item; rejects (never a silent empty) on
 * not-found / parse failure so the caller can fall back to the paste flow. */
export function osReadClaudeCredential(): Promise<string> {
  return invoke<string>("read_claude_credential");
}

/** Cancel an in-flight desktop Claude sign-in (kills the `claude` child). The
 * native side then emits `claude-login://done` with `error: null` (a benign
 * dismissal). No-op outside Tauri / when nothing is in flight. */
export function osCancelClaudeLogin(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke<void>("cancel_claude_login");
}

/** Pull the Houston window to the front. Used when a flow finishes in the
 * user's browser (e.g. a Composio integration connection lands) and we want
 * the app to surface itself — the same snap-back the sign-in loopback does.
 * No-op outside Tauri. */
export function osFocusWindow(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke<void>("focus_main_window");
}

/** Reveal an agent-relative file in Finder / Explorer. */
export function osRevealFile(
  agentPath: string,
  relativePath: string,
): Promise<void> {
  return invoke<void>("reveal_file", {
    agent_path: agentPath,
    relative_path: relativePath,
  });
}

/** Reveal the agent's folder in Finder / Explorer. */
export function osRevealAgent(agentPath: string): Promise<void> {
  return invoke<void>("reveal_agent", { agent_path: agentPath });
}

/** Reveal an arbitrary absolute path in Finder / Explorer. For files written
 * outside any agent root (e.g. the portable-agent exporter's save dialog). */
export function osRevealPath(path: string): Promise<void> {
  return invoke<void>("reveal_path", { path });
}

/** Native "Save as…" for downloaded bytes — the desktop webview ignores
 * anchor-download clicks (no download delegate), so the shell shows the OS
 * save dialog and writes the file itself (HOU-703). The bytes travel as a raw
 * IPC payload (not JSON) so large archives don't freeze the webview; the
 * filename rides in the percent-encoded `x-download-name` header. Resolves
 * with the chosen path, or null when the user cancelled the dialog. */
export function osSaveDownload(
  fileName: string,
  bytes: Uint8Array,
): Promise<string | null> {
  return invoke<string | null>("save_download", bytes, {
    headers: { "x-download-name": encodeURIComponent(fileName) },
  });
}

/** Open an agent-relative file with the user's default application. */
export function osOpenFile(
  agentPath: string,
  relativePath: string,
): Promise<void> {
  return invoke<void>("open_file", {
    agent_path: agentPath,
    relative_path: relativePath,
  });
}

/** Resolve the app bundle/executable path before updater install moves it. */
export function osCurrentAppBundlePath(): Promise<string> {
  return invoke<string>("current_app_bundle_path");
}

/** Relaunch the installed app from a path captured before update install. */
export function osRelaunchAppFromPath(appPath: string): Promise<void> {
  return invoke<void>("relaunch_app_from_path", { app_path: appPath });
}

/** Append a line to `~/Library/Application Support/houston/logs/frontend.log`. */
export function osWriteFrontendLog(
  level: "error" | "warn" | "info" | "debug",
  message: string,
  context?: string,
): Promise<void> {
  return invoke<void>("write_frontend_log", { level, message, context });
}

/** Show a native "agent finished" notification on Linux/Windows whose click
 * raises the window and emits `notification-clicked` (which navigates to the
 * mission — a plain refocus does not). macOS uses the JS notification plugin
 * instead — see session-notifications.ts. */
export function osShowSessionNotification(
  title: string,
  body: string,
): Promise<void> {
  return invoke<void>("show_session_notification", { title, body });
}

/** Read the last N lines from backend + frontend log files. */
export function osReadRecentLogs(
  lines = 50,
): Promise<{ backend: string; frontend: string }> {
  return invoke<{ backend: string; frontend: string }>("read_recent_logs", {
    lines,
  });
}

/** Send a prepared bug report to Houston's native bug-report intake.
 * Resolves with the Linear issue identifier (e.g. "BUG-123") when known. */
export function osReportBug(payload: unknown): Promise<string | null> {
  return invoke<string | null>("report_bug", { payload });
}

/** Hidden diagnostics command: intentionally panic in native code so release
 * builds can verify Rust/Tauri symbol upload and native stack rendering. */
export function osTriggerNativeSentrySmokeTest(): Promise<void> {
  return invoke<void>("sentry_native_stack_smoke_test");
}

// ── Local model bridge (guided "connect a local model") ───────────────────────
// Native, desktop-only: the Rust shell scans localhost for LM Studio / Jan /
// Ollama, runs a local auth proxy, and drives an frpc sidecar. These reach the
// user's OWN machine, so they never move to the (possibly remote) engine.

/** Scan the local machine for OpenAI-compatible model servers. */
export function osDetectLocalModels(): Promise<DetectedServer[]> {
  return invoke<DetectedServer[]>("detect_local_models");
}

/** Start the frpc bridge that exposes a local server at a public URL. */
export function osStartLocalBridge(
  args: StartBridgeArgs,
): Promise<StartBridgeResult> {
  return invoke<StartBridgeResult>("start_local_bridge", { ...args });
}

/** Re-establish frpc for the saved target after a restart, reusing the persisted
 *  proxyKey so the already-registered cloud endpoint stays valid. */
export function osReconnectLocalBridge(
  args: ReconnectBridgeArgs,
): Promise<StartBridgeResult> {
  return invoke<StartBridgeResult>("reconnect_local_bridge", { ...args });
}

/** The bridge target this machine has persisted, or `null` when this machine
 *  owns no local-model tunnel (direct/manual endpoint, or another machine's). */
export function osSavedBridgeTarget(): Promise<SavedBridgeTarget | null> {
  return invoke<SavedBridgeTarget | null>("saved_bridge_target");
}

/** Tear down the running bridge (frpc + local auth proxy). Idempotent. */
export function osStopLocalBridge(): Promise<void> {
  return invoke<void>("stop_local_bridge");
}

/** One-shot read of the bridge's current status (the `local-bridge-status`
 *  event streams the same shape). */
export function osLocalBridgeStatus(): Promise<BridgeStatus> {
  return invoke<BridgeStatus>("local_bridge_status");
}

// ── First-run cloud migration (HOU-719) ──────────────────────────────────
// Native, desktop-only: only the shell can read the OLD local install's
// `~/.houston` tree and spawn the bundled host against it. The wizard exports
// each legacy agent over loopback HTTP and uploads it to the cloud gateway.

import type { LegacyDetection } from "./cloud-migration";

/** Scan for legacy desktop data worth migrating. Fast, read-only. */
export function osDetectLegacyHouston(): Promise<LegacyDetection> {
  return invoke<LegacyDetection>("detect_legacy_houston");
}

/** Spawn (or return the already-running) passive migration-source host against
 *  the legacy tree. Can block for MINUTES — its boot converts a big chat db
 *  before the banner prints — so callers show a "preparing" state. Idempotent. */
export function osStartMigrationSourceHost(): Promise<{
  baseUrl: string;
  token: string;
}> {
  return invoke<{ baseUrl: string; token: string }>(
    "start_migration_source_host",
  );
}

/** Kill the migration-source host. Idempotent — absent is success. */
export function osStopMigrationSourceHost(): Promise<void> {
  return invoke<void>("stop_migration_source_host");
}

// ── On-device dictation (bundled whisper.cpp sidecar) ──────────────────────
// Native, desktop-only: transcription runs entirely on the user's machine, so
// (like the local-model bridge above) this never moves to the engine.

/** Transcribe a recorded WAV clip. The raw bytes ride the IPC payload (same
 *  raw-payload pattern as `osSaveDownload`) so a multi-megabyte clip can't
 *  freeze the webview; the language hint rides the `x-dictation-lang` header.
 *  Rejects with the exact string "model-not-ready" when the model hasn't
 *  been downloaded yet, or "transcription-timeout" on a stalled transcribe. */
export function osTranscribeAudio(
  wav: Uint8Array,
  langHint: string,
): Promise<string> {
  return invoke<string>("transcribe_audio", wav, {
    headers: { "x-dictation-lang": langHint },
  });
}

/** Whether the pinned dictation model is on disk. */
export function osDictationModelStatus(): Promise<DictationModelStatus> {
  return invoke<DictationModelStatus>("dictation_model_status");
}

/** Download (and sha256-verify) the pinned dictation model. Idempotent —
 *  resolves immediately if already ready. Progress rides the
 *  `dictation-model-progress` event; subscribe via
 *  {@link onDictationModelProgress} before calling this. */
export function osDownloadDictationModel(): Promise<void> {
  return invoke<void>("download_dictation_model");
}

/** Subscribe to `dictation-model-progress` ticks emitted while
 *  {@link osDownloadDictationModel} runs. Mirrors how `local-bridge-status`
 *  is consumed (see `useLocalBridgeStatus`) — resolves with the unlisten fn. */
export function onDictationModelProgress(
  handler: (progress: DictationModelProgress) => void,
): Promise<UnlistenFn> {
  return listen<DictationModelProgress>("dictation-model-progress", (ev) =>
    handler(ev.payload),
  );
}
