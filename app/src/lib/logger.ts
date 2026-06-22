import { osWriteFrontendLog } from "./os-bridge";

type LogLevel = "error" | "warn" | "info" | "debug";

/** Write a log entry to ~/Library/Application Support/houston/logs/frontend.log */
function writeLog(level: LogLevel, message: string, context?: string) {
  osWriteFrontendLog(level, message, context).catch(() => {
    // If logging itself fails, don't recurse — just drop it
  });
}

export const logger = {
  error: (message: string, context?: string) =>
    writeLog("error", message, context),
  warn: (message: string, context?: string) =>
    writeLog("warn", message, context),
  info: (message: string, context?: string) =>
    writeLog("info", message, context),
  debug: (message: string, context?: string) =>
    writeLog("debug", message, context),
};

/**
 * Patch global error handlers to write to the log file.
 * Call once at app startup (main.tsx).
 */
export function initFrontendLogging() {
  const originalOnError = window.onerror;
  window.onerror = (event, source, line, col, error) => {
    const message = error?.message ?? String(event);
    const context = `source=${source ?? "unknown"} line=${line}:${col}`;
    writeLog("error", `[uncaught] ${message}`, context);
    if (typeof originalOnError === "function") {
      return originalOnError(event, source, line, col, error);
    }
    return false;
  };

  const originalOnRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const message = event.reason?.message ?? String(event.reason);
    writeLog("error", `[unhandled-rejection] ${message}`);
    if (typeof originalOnRejection === "function") {
      return originalOnRejection.call(window, event);
    }
  };

  // Patch console.error and console.warn to also write to log file
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    writeLog("error", args.map(String).join(" "));
  };

  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    origWarn.apply(console, args);
    writeLog("warn", args.map(String).join(" "));
  };
}
