import type { EngineSentry, LogCaptureLevel } from "./client";

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
