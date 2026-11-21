import { BugReportError, toBugReportFailure } from "../bug-report-failure.ts";
import { invokeNative } from "./invoke.ts";
import { osIsTauri } from "./platform.ts";

export function osWriteFrontendLog(
  level: "error" | "warn" | "info" | "debug",
  message: string,
  context?: string,
): Promise<void> {
  return invokeNative<void>("write_frontend_log", { level, message, context });
}

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

export async function osReportBug(payload: unknown): Promise<string | null> {
  try {
    return await invokeNative<string | null>("report_bug", { payload });
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new BugReportError(toBugReportFailure(err));
  }
}

export function osTriggerNativeSentrySmokeTest(): Promise<void> {
  return invokeNative<void>("sentry_native_stack_smoke_test");
}

export async function osLaunchT0Ms(): Promise<number | null> {
  if (!osIsTauri()) return null;
  try {
    return (await invokeNative<number | null>("launch_t0_ms")) ?? null;
  } catch {
    return null;
  }
}
