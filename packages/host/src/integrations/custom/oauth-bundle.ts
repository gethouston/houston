import { refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { CustomSecretStore } from "./secrets";

/**
 * The stored OAuth grant for one custom integration (PRODUCT-1172): tokens +
 * the registered client + enough discovery to refresh WITHOUT re-walking the
 * server's metadata. It lives in the secret store under the SAME id the
 * executor connection references as its `token` input — the credential
 * provider recognizes the bundle shape and serves the CURRENT access token,
 * refreshing first when it is about to expire, so mid-session rotation needs
 * no executor rewire (the executor re-reads inputs per request).
 */
export interface CustomOAuthBundle {
  kind: "houston-custom-oauth";
  version: 1;
  /** RFC 8707 resource the tokens are bound to (the MCP endpoint), if any. */
  resource?: string;
  authorizationServerUrl: string;
  metadata?: AuthorizationServerMetadata;
  client: OAuthClientInformationFull;
  tokens: OAuthTokens;
  /** ms epoch when the access token dies; null when none was reported. */
  expiresAt: number | null;
}

export function bundleOf(input: {
  resource?: string;
  authorizationServerUrl: string;
  metadata?: AuthorizationServerMetadata;
  client: OAuthClientInformationFull;
  tokens: OAuthTokens;
}): CustomOAuthBundle {
  return {
    kind: "houston-custom-oauth",
    version: 1,
    ...(input.resource ? { resource: input.resource } : {}),
    authorizationServerUrl: input.authorizationServerUrl,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    client: input.client,
    tokens: input.tokens,
    expiresAt: input.tokens.expires_in
      ? Date.now() + input.tokens.expires_in * 1000
      : null,
  };
}

/** Parse a stored secret value as a bundle; a plain API key parses to null. */
export function parseBundle(raw: string): CustomOAuthBundle | null {
  try {
    const parsed = JSON.parse(raw) as CustomOAuthBundle;
    return parsed?.kind === "houston-custom-oauth" &&
      typeof parsed.tokens?.access_token === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Refresh this early so a token never dies mid-request. */
const EXPIRY_SKEW_MS = 60_000;

const expired = (bundle: CustomOAuthBundle): boolean =>
  bundle.expiresAt !== null && Date.now() >= bundle.expiresAt - EXPIRY_SKEW_MS;

/** One refresh per secret id at a time — the executor resolves credentials
 *  per request, and parallel tool calls must not race the rotation (a used
 *  refresh token may be single-use). */
const refreshing = new Map<string, Promise<string>>();

/**
 * Serve the current access token for a stored bundle, refreshing (and
 * persisting the rotated bundle) when it is about to expire. `raw` is the
 * stored string the bundle was parsed from — the compare-and-swap witness. A
 * refresh failure or a grant with no refresh token throws an actionable
 * message — the execute error is the user's cue to sign in again.
 */
export function resolveOAuthValue(
  store: CustomSecretStore,
  id: string,
  raw: string,
  bundle: CustomOAuthBundle,
  fetchFn?: typeof fetch,
): Promise<string> {
  if (!expired(bundle)) return Promise.resolve(bundle.tokens.access_token);
  const inFlight = refreshing.get(id);
  if (inFlight) return inFlight;
  const run = refreshBundle(store, id, raw, bundle, fetchFn).finally(() => {
    refreshing.delete(id);
  });
  refreshing.set(id, run);
  return run;
}

async function refreshBundle(
  store: CustomSecretStore,
  id: string,
  raw: string,
  bundle: CustomOAuthBundle,
  fetchFn?: typeof fetch,
): Promise<string> {
  const refreshToken = bundle.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error(
      "the sign-in for this integration has expired - sign in again from its card",
    );
  }
  // The SDK preserves the original refresh_token when the server rotates none.
  const tokens = await refreshAuthorization(bundle.authorizationServerUrl, {
    ...(bundle.metadata ? { metadata: bundle.metadata } : {}),
    clientInformation: bundle.client,
    refreshToken,
    ...(bundle.resource ? { resource: new URL(bundle.resource) } : {}),
    ...(fetchFn ? { fetchFn } : {}),
  });
  const rotated = bundleOf({ ...bundle, tokens });
  // Compare-and-swap: a completeOAuth (new grant) or a remove/replace can
  // land while the refresh round-trip is in flight — persisting over THEIR
  // write would resurrect a deleted secret or clobber the newer grant. The
  // fresh token still serves the request that triggered the refresh.
  if ((await store.get(id)) === raw) {
    await store.set(id, JSON.stringify(rotated));
  }
  return tokens.access_token;
}
