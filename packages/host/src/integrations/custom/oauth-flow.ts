import { randomBytes } from "node:crypto";
import {
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { guardedFetch } from "./fetch-guard";
import { bundleOf, type CustomOAuthBundle } from "./oauth-bundle";
import { discoverCustomOAuth } from "./oauth-discovery";
import type { CustomIntegrationDef } from "./types";
import { CustomIntegrationError } from "./types";

export interface CustomOAuthAttempt {
  slug: string;
  endpoint: string;
  codeVerifier: string;
  redirectUri: string;
  authorizationServerUrl: string;
  metadata?: AuthorizationServerMetadata;
  client: OAuthClientInformationFull;
  resource?: string;
  expiresAtMs: number;
}

const ATTEMPT_TTL_MS = 10 * 60 * 1000;

const oauthFailed = (context: string, err: unknown): CustomIntegrationError =>
  new CustomIntegrationError(
    "oauth_failed",
    `${context}: ${err instanceof Error ? err.message : String(err)}`,
  );

export async function beginCustomOAuth(
  def: CustomIntegrationDef & { kind: "mcp" },
  redirectUri: string,
  existing: CustomOAuthBundle | null,
  opts: { fetchFn?: typeof fetch; statePrefix?: string } = {},
): Promise<{
  state: string;
  authorizeUrl: string;
  attempt: CustomOAuthAttempt;
}> {
  const fetchFn = opts.fetchFn ?? guardedFetch;
  const { statePrefix } = opts;
  let info: Awaited<ReturnType<typeof discoverCustomOAuth>>;
  try {
    info = await discoverCustomOAuth(def.endpoint, fetchFn, def.headers);
  } catch (err) {
    throw oauthFailed(`could not discover how ${def.name} signs in`, err);
  }
  const metadata = info.authorizationServerMetadata;
  const resource = info.resourceMetadata?.resource;
  const scope = info.resourceMetadata?.scopes_supported?.join(" ");

  let client = existing?.client;
  if (!client?.redirect_uris?.includes(redirectUri)) {
    try {
      client = await registerClient(info.authorizationServerUrl, {
        ...(metadata ? { metadata } : {}),
        clientMetadata: {
          client_name: "Houston",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        ...(scope ? { scope } : {}),
        fetchFn,
      });
    } catch (err) {
      throw oauthFailed(
        `${def.name} did not accept Houston as a sign-in app (registration at ${metadata?.registration_endpoint ?? info.authorizationServerUrl})`,
        err,
      );
    }
  }

  const state = `${statePrefix ? `${statePrefix}.` : ""}${randomBytes(16).toString("hex")}`;
  try {
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      info.authorizationServerUrl,
      {
        ...(metadata ? { metadata } : {}),
        clientInformation: client,
        redirectUrl: redirectUri,
        ...(scope ? { scope } : {}),
        state,
        ...(resource ? { resource: new URL(resource) } : {}),
      },
    );
    if (!isBrowserSafe(authorizationUrl)) {
      throw new Error(
        `refused the non-https sign-in address ${authorizationUrl.protocol}//…`,
      );
    }
    return {
      state,
      authorizeUrl: authorizationUrl.toString(),
      attempt: {
        slug: def.slug,
        endpoint: def.endpoint,
        codeVerifier,
        redirectUri,
        authorizationServerUrl: info.authorizationServerUrl,
        ...(metadata ? { metadata } : {}),
        client,
        ...(resource ? { resource } : {}),
        expiresAtMs: Date.now() + ATTEMPT_TTL_MS,
      },
    };
  } catch (err) {
    if (err instanceof CustomIntegrationError) throw err;
    throw oauthFailed(`could not start the ${def.name} sign-in`, err);
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isBrowserSafe = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));

export async function settleCustomOAuth(
  attempt: CustomOAuthAttempt,
  code: string,
  fetchOverride?: typeof fetch,
): Promise<CustomOAuthBundle> {
  const fetchFn = fetchOverride ?? guardedFetch;
  try {
    const tokens = await exchangeAuthorization(attempt.authorizationServerUrl, {
      ...(attempt.metadata ? { metadata: attempt.metadata } : {}),
      clientInformation: attempt.client,
      authorizationCode: code,
      codeVerifier: attempt.codeVerifier,
      redirectUri: attempt.redirectUri,
      ...(attempt.resource ? { resource: new URL(attempt.resource) } : {}),
      fetchFn,
    });
    return bundleOf({
      ...(attempt.resource ? { resource: attempt.resource } : {}),
      authorizationServerUrl: attempt.authorizationServerUrl,
      ...(attempt.metadata ? { metadata: attempt.metadata } : {}),
      client: attempt.client,
      tokens,
    });
  } catch (err) {
    throw oauthFailed("the sign-in could not be completed", err);
  }
}
