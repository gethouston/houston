import type { EngineSentry, LogCaptureLevel } from "./client";

/**
 * Route a process's `console.*` into Sentry WITHOUT changing what it prints —
 * the host logs straight through console (its stderr is the supervisor's
 * engine.log), so wrapping console is the one seam that sees every error site.
 *
 * The runtime does NOT use this: its `installRuntimeLogging` already owns
 * console and forwards entries via `LoggerOptions.capture` instead (wrapping
 * twice would double-report).
 *
 * Returns a restore function (tests).
 */
export function installConsoleCapture(
  sentry: EngineSentry,
  target: Console = console,
): () => void {
  const previous = {
    debug: target.debug,
    error: target.error,
    info: target.info,
    log: target.log,
    warn: target.warn,
  };
  const wrap =
    (original: (...values: unknown[]) => void, level: LogCaptureLevel) =>
    (...values: unknown[]) => {
      original.apply(target, values);
      sentry.captureLog(level, values);
    };
  target.debug = wrap(previous.debug, "DEBUG");
  target.info = wrap(previous.info, "INFO");
  target.log = wrap(previous.log, "INFO");
  target.warn = wrap(previous.warn, "WARN");
  target.error = wrap(previous.error, "ERROR");
  return () => {
    Object.assign(target, previous);
  };
}
