/**
 * The one credential family whose deadness is decidable from shape alone
 * (HOU-1107; Sentry HOUSTON-APP-4Y9, HOUSTON-APP-567): a google "API key" that
 * is really OAuth material — an OAuth access token (`ya29.…`) or a JWT
 * (`eyJ…`) pasted before live verification existed. Those can never
 * authenticate as an `x-goog-api-key`, so refusing them from shape is safe.
 *
 * DENYLIST on purpose (PRODUCT-1368). This predicate used to allowlist the
 * `AIza` prefix ("every Google API key starts with AIza") — then Google
 * shipped a second format: AI Studio now issues auth keys starting with
 * `AQ.`, and the allowlist refused every one of them AND reported the central
 * row for deletion. Judging validity from shape is Google's job, not ours:
 * every new paste is live-verified against the models-list endpoint
 * (runtime/auth/verify-api-key.ts), so the only rows this guard must catch
 * are the frozen legacy OAuth pastes — which ARE decidable. An unknown future
 * key format must fail open here and let Google be the judge.
 *
 * Google-only and api_key-only on purpose: other providers' key shapes are
 * not this crisp, and a google OAuth credential is a different,
 * already-guarded story.
 *
 * Shared between the runtime's serve guard (refuse + report the served row)
 * and the host's central-store adapters (never store, adopt, or capture such a
 * row) so both ends of the pipeline agree on what "dead" means.
 */
export function deadGoogleApiKey(cred: {
  provider: string;
  kind?: "oauth" | "api_key";
  access: string;
}): boolean {
  return (
    cred.provider === "google" &&
    cred.kind === "api_key" &&
    (cred.access.startsWith("ya29.") || cred.access.startsWith("eyJ"))
  );
}
