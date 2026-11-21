export const CUSTOM_OAUTH_RETURN_WINDOW_MS = 10 * 60 * 1000;

let startedAt: number | null = null;

export function markCustomOAuthStarted(now: number = Date.now()): void {
  startedAt = now;
}

export function consumeCustomOAuthReturn(now: number = Date.now()): boolean {
  const fresh =
    startedAt !== null && now - startedAt <= CUSTOM_OAUTH_RETURN_WINDOW_MS;
  startedAt = null;
  return fresh;
}
