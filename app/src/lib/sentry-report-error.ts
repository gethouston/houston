export function createSentryReportError(
  command: string,
  message: string,
  originalError?: unknown,
): Error {
  const error = new Error(message);
  // Some runtimes (and Sentry/polyfill-patched globals) expose
  // `Error.prototype.name` as a getter-only accessor, so a plain
  // `error.name = command` assignment throws ("Cannot set property name … which
  // has only a getter") — inside the error reporter itself. Define an own data
  // property instead: it shadows any inherited accessor and never throws on a
  // fresh Error, while keeping `name` as the Sentry exception type used for
  // grouping/triage.
  Object.defineProperty(error, "name", {
    value: command,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  if (originalError instanceof Error && originalError.stack) {
    error.stack = originalError.stack;
  }
  return error;
}
