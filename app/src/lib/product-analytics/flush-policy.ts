export type FlushScheduler = (run: () => void, ms: number) => () => void;

export const FLUSH_DELAY_MS = 3_000;
export const FLUSH_AT_QUEUED = 25;
export const MAX_BATCH = 100;
export const MAX_ATTEMPTS = 2;
const MAX_HOLD_DELAY_MS = 60_000;

export function nextHoldDelay(currentMs: number): number {
  return currentMs > 0
    ? Math.min(currentMs * 2, MAX_HOLD_DELAY_MS)
    : FLUSH_DELAY_MS;
}

export const defaultSchedule: FlushScheduler = (run, ms) => {
  const handle = setTimeout(run, ms);
  (handle as { unref?: () => void }).unref?.();
  return () => clearTimeout(handle);
};
