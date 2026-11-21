import { classifyAssistantDiscoveryFailure } from "./assistant-availability.ts";

export const ASSISTANT_TRANSIENT_RETRY_LIMIT = 4;
export const ASSISTANT_UNEXPECTED_RETRY_LIMIT = 1;
export const ASSISTANT_RETRY_BASE_DELAY_MS = 1_000;
export const ASSISTANT_RETRY_MIN_DELAY_MS = 500;
export const ASSISTANT_RETRY_MAX_DELAY_MS = 8_000;
export const ASSISTANT_TRANSIENT_REFETCH_MS = 60_000;

export function assistantRefetchIntervalMs(error: unknown): number | false {
  if (!error) return false;
  return classifyAssistantDiscoveryFailure(error).kind === "transient"
    ? ASSISTANT_TRANSIENT_REFETCH_MS
    : false;
}

export function shouldRetryAssistantDiscovery(
  failureCount: number,
  err: unknown,
): boolean {
  switch (classifyAssistantDiscoveryFailure(err).kind) {
    case "unsupported":
      return false;
    case "transient":
      return failureCount < ASSISTANT_TRANSIENT_RETRY_LIMIT;
    case "unexpected":
      return failureCount < ASSISTANT_UNEXPECTED_RETRY_LIMIT;
  }
}

export function assistantDiscoveryRetryDelayMs(
  attempt: number,
  err: unknown,
): number {
  const failure = classifyAssistantDiscoveryFailure(err);
  const hint = failure.kind === "transient" ? failure.retryAfterMs : null;
  if (hint !== null) {
    return Math.min(
      Math.max(hint, ASSISTANT_RETRY_MIN_DELAY_MS),
      ASSISTANT_RETRY_MAX_DELAY_MS,
    );
  }
  return Math.min(
    ASSISTANT_RETRY_BASE_DELAY_MS * 2 ** attempt,
    ASSISTANT_RETRY_MAX_DELAY_MS,
  );
}
