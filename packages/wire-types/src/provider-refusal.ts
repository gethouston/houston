/**
 * The cloud gateway's typed refusals of a send over the person's AI provider
 * credential, answered `409` before anything ran:
 *
 *  - `no_provider`: no credential for the provider (or for any provider) in
 *    the acting scope. The remedy is a sign-in; the SDK settles it as the
 *    `unauthenticated` card with cause `no_credentials`.
 *  - `provider_account_blocked`: the credential is intact but the provider
 *    blocks the ACCOUNT behind it (GitHub Copilot with billing locked). A
 *    sign-in would change nothing; the person fixes it at the provider or
 *    picks another AI. Settled as `unauthenticated` with cause
 *    `billing_locked`.
 *
 * `error` is the gateway's own sentence (a default for surfaces without a
 * dictionary); `provider` names the pi provider id when the gateway knows it.
 */
export type ProviderRefusalCode = "no_provider" | "provider_account_blocked";

export interface ProviderRefusal {
  code: ProviderRefusalCode;
  error: string;
  provider?: string;
}

const CODES: ReadonlySet<string> = new Set([
  "no_provider",
  "provider_account_blocked",
]);

/** Parse only a typed provider refusal body; anything else is null. */
export function parseProviderRefusal(body: unknown): ProviderRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.has(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: ProviderRefusal = {
    code: value.code as ProviderRefusalCode,
    error: value.error,
  };
  if (typeof value.provider === "string" && value.provider !== "")
    refusal.provider = value.provider;
  return refusal;
}

/** {@link parseProviderRefusal} over a raw response text. */
export function parseProviderRefusalText(text: string): ProviderRefusal | null {
  try {
    return parseProviderRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}
