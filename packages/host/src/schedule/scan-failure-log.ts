export const SCAN_FAILURE_REPEAT_MS = 60 * 60 * 1000;

interface LoggedFailure {
  reason: string;
  at: number;
}

const logged = new Map<string, LoggedFailure>();

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

export function clearScanFailure(where: string): void {
  logged.delete(where);
}

export function resetScanFailureLogForTests(): void {
  logged.clear();
}
