/**
 * The scheduler's per-agent scan failure is logged at error level (the
 * background sweep has no UI thread), and one unreadable routines file used
 * to log it on EVERY tick: 120 identical Sentry events an hour for a day and
 * a half, from a single agent. A failure is worth one line when it starts
 * and one when its reason changes; the same reason repeats once an hour so
 * a broken agent never goes silent either.
 */
export const SCAN_FAILURE_REPEAT_MS = 60 * 60 * 1000;

interface LoggedFailure {
  reason: string;
  at: number;
}

const logged = new Map<string, LoggedFailure>();

/** Whether this tick's failure for `where` is worth a log line. */
export function shouldLogScanFailure(
  where: string,
  reason: string,
  now: number,
): boolean {
  const previous = logged.get(where);
  if (
    previous &&
    previous.reason === reason &&
    now - previous.at < SCAN_FAILURE_REPEAT_MS
  ) {
    return false;
  }
  logged.set(where, { reason, at: now });
  return true;
}

/** A scan that succeeded clears the agent's streak, so the next failure logs at once. */
export function clearScanFailure(where: string): void {
  logged.delete(where);
}

/** Test seam. */
export function resetScanFailureLogForTests(): void {
  logged.clear();
}
