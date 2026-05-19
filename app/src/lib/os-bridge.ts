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

import { invoke } from "@tauri-apps/api/core";
import { listen, emit, type Event, type UnlistenFn } from "@tauri-apps/api/event";

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

/** Reveal an agent-relative file in Finder / Explorer. */
export function osRevealFile(agentPath: string, relativePath: string): Promise<void> {
  return invoke<void>("reveal_file", { agent_path: agentPath, relative_path: relativePath });
}

/** Reveal the agent's folder in Finder / Explorer. */
export function osRevealAgent(agentPath: string): Promise<void> {
  return invoke<void>("reveal_agent", { agent_path: agentPath });
}

/** Open an agent-relative file with the user's default application. */
export function osOpenFile(agentPath: string, relativePath: string): Promise<void> {
  return invoke<void>("open_file", { agent_path: agentPath, relative_path: relativePath });
}

/** Launch a terminal app scoped to the given path. */
export function osOpenTerminal(
  path: string,
  command?: string,
  terminalApp?: string,
): Promise<void> {
  return invoke<void>("open_terminal", {
    path,
    command: command ?? null,
    terminal_app: terminalApp ?? null,
  });
}

/** Is the Claude CLI installed on this machine? */
export function osCheckClaudeCli(): Promise<boolean> {
  return invoke<boolean>("check_claude_cli");
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

/** Read the last N lines from backend + frontend log files. */
export function osReadRecentLogs(
  lines = 50,
): Promise<{ backend: string; frontend: string }> {
  return invoke<{ backend: string; frontend: string }>("read_recent_logs", { lines });
}

/** Send a prepared bug report to Houston's native bug-report intake.
 * Resolves with the Linear issue identifier (e.g. "BUG-123") when known. */
export function osReportBug(payload: unknown): Promise<string | null> {
  return invoke<string | null>("report_bug", { payload });
}
