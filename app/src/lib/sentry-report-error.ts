export function createSentryReportError(
  command: string,
  message: string,
  originalError?: unknown,
): Error {
  const error = new Error(message);
  error.name = command;
  if (originalError instanceof Error && originalError.stack) {
    error.stack = originalError.stack;
  }
  return error;
}
