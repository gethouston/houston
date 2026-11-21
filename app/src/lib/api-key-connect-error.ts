export type ApiKeyConnectReason =
  | "invalid_key"
  | "key_restricted"
  | "provider_unavailable";

const REASONS: readonly string[] = [
  "invalid_key",
  "key_restricted",
  "provider_unavailable",
];

export function apiKeyConnectReason(err: unknown): ApiKeyConnectReason | null {
  if (!err || typeof err !== "object" || !("body" in err)) return null;
  let body = (err as { body?: unknown }).body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  const reason = (body as { reason?: unknown } | null)?.reason;
  return typeof reason === "string" && REASONS.includes(reason)
    ? (reason as ApiKeyConnectReason)
    : null;
}

export function isApiKeyUserRejection(err: unknown): boolean {
  const reason = apiKeyConnectReason(err);
  return reason === "invalid_key" || reason === "key_restricted";
}
