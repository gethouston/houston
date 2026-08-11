/**
 * The one credential family whose deadness is decidable from shape alone
 * (HOU-1107; Sentry HOUSTON-APP-4Y9, HOUSTON-APP-567): a google "API key" that
 * is really OAuth material. Every Google Cloud API key starts with the
 * documented, stable `AIza` prefix; the legacy pre-verification pastes never do
 * — they are OAuth access tokens (`ya29.…`) or JWTs (`eyJ…`) that can never
 * authenticate as an `x-goog-api-key`. Google-only and api_key-only on
 * purpose: other providers' key shapes are not this crisp, and a google OAuth
 * credential is a different, already-guarded story.
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
    !cred.access.startsWith("AIza")
  );
}
