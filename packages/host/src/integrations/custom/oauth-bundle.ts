import { refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { guardedFetch } from "./fetch-guard";
import type { CustomSecretStore } from "./secrets";

export interface CustomOAuthBundle {
  kind: "houston-custom-oauth";
  version: 1;
  resource?: string;
  authorizationServerUrl: string;
  metadata?: AuthorizationServerMetadata;
  client: OAuthClientInformationFull;
  tokens: OAuthTokens;
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

const EXPIRY_SKEW_MS = 60_000;

const expired = (bundle: CustomOAuthBundle): boolean =>
  bundle.expiresAt !== null && Date.now() >= bundle.expiresAt - EXPIRY_SKEW_MS;

const refreshing = new Map<string, Promise<string>>();

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
  const tokens = await refreshAuthorization(bundle.authorizationServerUrl, {
    ...(bundle.metadata ? { metadata: bundle.metadata } : {}),
    clientInformation: bundle.client,
    refreshToken,
    ...(bundle.resource ? { resource: new URL(bundle.resource) } : {}),
    fetchFn: fetchFn ?? guardedFetch,
  });
  const rotated = bundleOf({ ...bundle, tokens });
  if ((await store.get(id)) === raw) {
    await store.set(id, JSON.stringify(rotated));
  }
  return tokens.access_token;
}
