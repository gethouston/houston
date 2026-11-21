export const DEFAULT_GLOBAL_RECONNECT_MS = 1500;

export const WAKE_STALE_MS = 20_000;

export const WAKE_SETTLE_MS = 1_000;

export interface GlobalEventsOptions {
  url: () => string;
  fetch: typeof fetch;
  signal: AbortSignal;
  onEvent: (data: unknown) => void;
  onConnect?: () => void;
  onUnauthorized?: () => void;
  onError?: (err: unknown) => void;
  delayMs?: number;
  maxDelayMs?: number;
  jitter?: (capMs: number) => number;
  idleTimeoutMs?: number;
  wake?: (retryNow: () => void) => () => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}
