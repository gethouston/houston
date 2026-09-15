/**
 * `diagnostics` category: this machine's logs, its native crash reporting and
 * the shell's own process clock. Local facts the engine cannot observe.
 */

import { invokeNative } from "./invoke.ts";
import { osIsTauri } from "./platform.ts";

/** Append a line to `~/Library/Application Support/houston/logs/frontend.log`. */
export function osWriteFrontendLog(
  level: "error" | "warn" | "info" | "debug",
  message: string,
  context?: string,
): Promise<void> {
  return invokeNative<void>("write_frontend_log", { level, message, context });
}

/** Read the last N lines from backend + frontend log files. */
export function osReadRecentLogs(
  lines = 50,
): Promise<{ backend: string; frontend: string }> {
  return invokeNative<{ backend: string; frontend: string }>(
    "read_recent_logs",
    {
      lines,
    },
  );
}

/** Send a prepared bug report to Houston's native bug-report intake.
 * Resolves with the Linear issue identifier (e.g. "BUG-123") when known. */
export function osReportBug(payload: unknown): Promise<string | null> {
  return invokeNative<string | null>("report_bug", { payload });
}

/** Hidden diagnostics command: intentionally panic in native code so release
 * builds can verify Rust/Tauri symbol upload and native stack rendering. */
export function osTriggerNativeSentrySmokeTest(): Promise<void> {
  return invokeNative<void>("sentry_native_stack_smoke_test");
}

/** The shell's process-start stamp (epoch ms) — the app-open T0 the perf
 *  spans measure from (HOU-1011). `null` outside Tauri or on a shell too old
 *  to serve the command (the caller falls back to `performance.timeOrigin`). */
export async function osLaunchT0Ms(): Promise<number | null> {
  if (!osIsTauri()) return null;
  try {
    return (await invokeNative<number | null>("launch_t0_ms")) ?? null;
  } catch {
    // Older shell without the command — the webview clock is close enough.
    return null;
  }
}
