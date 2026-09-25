import type { Config } from "../data/config";

/** Only an explicit `"pending"` offers the start button: an absent field is an
 *  employee that predates it or joined with no first day to run. */
export function isFirstDayPending(config: Config | undefined): boolean {
  return config?.firstDay === "pending";
}

/**
 * The host's answer to a start button that outlived its first day (another
 * tab or the AI Manager already started it, or the employee has none): an
 * expected state the config refetch resolves, not a failure to report.
 */
export function isFirstDayNotPendingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { status, body } = err as { status?: unknown; body?: unknown };
  return (
    status === 409 &&
    (body as { code?: unknown } | null)?.code === "first_day_not_pending"
  );
}
