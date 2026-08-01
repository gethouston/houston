import {
  currentCredentialScope,
  isPersonalScope,
} from "../session/acting-context";

/**
 * WHICH credential the gateway actually served, per (acting identity, provider).
 *
 * The gateway resolves whose credential answers at serve time (HOU-976) and
 * reports its verdict on the serve body. The runtime remembers it so two
 * surfaces can be honest about it without re-asking:
 *  - a turn's `ProviderError` carries `credential` (ai/provider-error.ts), so a
 *    rate-limited turn can name the account that hit the wall instead of the
 *    provider alone;
 *  - the `/providers` rows carry the scope their `configured` came from
 *    (ai/providers.ts), so the model picker can label it.
 *
 * Lives in its own module rather than in serve.ts because ai/providers.ts reads
 * it and serve.ts imports ai/providers.ts — the reverse edge would close the
 * storage → providers → serve init cycle that already broke the engine bundle
 * once (see auth/report-revoked.ts).
 *
 * Only IDENTITY-BEARING scopes are recorded: with no acting identity there is
 * exactly one credential and nothing to disambiguate, so desktop / self-host /
 * routine turns record nothing and every consumer stays byte-identical.
 * In-memory only, like credential-health.ts: a restart re-learns it from the
 * next serve.
 */
export type ServedCredentialScope = "personal" | "team";

/** `${scopeKey}:${provider}` → the gateway's verdict for that pair. */
const served = new Map<string, ServedCredentialScope>();

function markFor(scopeKey: string, provider: string): string {
  return `${scopeKey}:${provider}`;
}

/** Record what the CURRENT scope's serve resolved to for `provider`. */
export function recordServedScope(
  provider: string,
  scope: ServedCredentialScope,
): void {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return;
  served.set(markFor(key, provider), scope);
}

/** Forget a provider the CURRENT scope is no longer served (an authoritative
 *  "not connected"), so a stale scope can never be stamped on a later error. */
export function forgetServedScope(provider: string): void {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return;
  served.delete(markFor(key, provider));
}

/**
 * The gateway's verdict for `provider` under the CURRENT acting identity, or
 * undefined when this runtime has no acting identity (desktop / self-host /
 * routine) or has never served that provider for it.
 */
export function servedScopeFor(
  provider: string,
): ServedCredentialScope | undefined {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return undefined;
  return served.get(markFor(key, provider));
}

/** Tests only: forget every recorded verdict. */
export function resetServedScopes(): void {
  served.clear();
}
