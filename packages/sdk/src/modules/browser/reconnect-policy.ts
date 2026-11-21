export const BROWSER_LIVE_BACKOFF_MS = [500, 1000, 2000, 4000, 8000] as const;
export const BROWSER_LIVE_MAX_ATTEMPTS = 8;
export const BROWSER_LIVE_HEALTHY_MS = 10_000;

export function reconnectDelay(attempt: number): number {
  const steps = BROWSER_LIVE_BACKOFF_MS;
  return steps[Math.min(attempt - 1, steps.length - 1)];
}
