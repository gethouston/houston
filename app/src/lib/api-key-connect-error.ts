/**
 * The typed reason a pasted API key failed to connect, carried end-to-end from
 * the runtime's live verification (`ApiKeyVerifyError.reason`) through the
 * host's error body (`{error, reason}`) to the connect dialog, which maps it
 * to actionable copy — a bad key, a key blocked by its own settings (Google:
 * API not enabled on the project, referrer allowlist), or a provider outage
 * where the key may be fine.
 */
export type ApiKeyConnectReason =
  | "invalid_key"
  | "key_restricted"
  | "provider_unavailable";

const REASONS: readonly string[] = [
  "invalid_key",
  "key_restricted",
  "provider_unavailable",
];

/**
 * Read the typed reason off a thrown connect error, or null when none rode
 * along (older engines, transport failures). Duck-typed on the error's `body`
 * because the two adapters throw different classes with different body shapes
 * — the cloud control plane a `HoustonEngineError` (body: parsed JSON), the
 * local runtime-client an `EngineError` (body: raw response text) — and this
 * app-level helper must not import either.
 */
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
