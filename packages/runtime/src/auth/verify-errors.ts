export const VERIFY_TIMEOUT_MS = 20_000;

export const PROVES_AUTH: ReadonlySet<string> = new Set([
  "rate_limited",
  "usage_limit_paused",
  "quota_exhausted",
  "model_unavailable",
  "context_overflow",
]);

export function raisedMessage(e: unknown, providerId: string): string {
  if (
    e instanceof Error &&
    (e.name === "TimeoutError" || e.name === "AbortError")
  ) {
    return `${providerId} did not answer within ${VERIFY_TIMEOUT_MS / 1000}s`;
  }
  return e instanceof Error ? e.message : String(e);
}

export type ApiKeyVerifyReason =
  | "invalid_key"
  | "key_restricted"
  | "provider_unavailable";

export class ApiKeyVerifyError extends Error {
  constructor(
    message: string,
    public readonly reason: ApiKeyVerifyReason,
  ) {
    super(message);
    this.name = "ApiKeyVerifyError";
  }
}

export function rejected(
  providerId: string,
  message: string,
): ApiKeyVerifyError {
  return new ApiKeyVerifyError(
    `${providerId} rejected this API key — check the key and paste it again (${message})`,
    "invalid_key",
  );
}

export function noVerdict(
  providerId: string,
  message: string,
): ApiKeyVerifyError {
  return new ApiKeyVerifyError(
    `could not verify the ${providerId} API key: ${message} — the key was not saved; try again`,
    "provider_unavailable",
  );
}
