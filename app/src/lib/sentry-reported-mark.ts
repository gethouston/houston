const REPORTED_TO_SENTRY = Symbol.for("houston.error.reportedToSentry");

export function markReportedToSentry(err: unknown): void {
  if (!err || typeof err !== "object" || !Object.isExtensible(err)) return;
  (err as Record<symbol, unknown>)[REPORTED_TO_SENTRY] = true;
}

export function wasReportedToSentry(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as Record<symbol, unknown>)[REPORTED_TO_SENTRY] === true
  );
}
