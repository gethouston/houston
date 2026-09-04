import { randomBytes } from "node:crypto";
import {
  discoverOAuthServerInfo,
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
import type { CustomIntegrationDef } from "./types";
import { CustomIntegrationError } from "./types";

/**
 * The browser half of custom-integration OAuth (PRODUCT-1172): Houston is the
 * OAuth client — RFC 9728/8414 discovery, RFC 7591 dynamic registration, and
 * the PKCE authorization-code dance — and the executor only ever sees the
 * resulting access token as a Bearer credential. One pending attempt per
 * integration; the browser-carried `state` is the callback's whole identity,
 * so it is random, single-use, and expiring.
 */
export interface CustomOAuthAttempt {
  slug: string;
  /** The MCP endpoint the attempt was started FOR. The completion re-checks
   *  it against the then-current definition: a replace that moved the slug to
   *  a different service mid-flow must not receive the old service's tokens. */
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

/** In-memory pending attempts. A host restart drops them — the user simply
 *  presses Sign in again; nothing durable is at stake before the exchange. */
export class CustomOAuthAttempts {
  private readonly byState = new Map<string, CustomOAuthAttempt>();

  put(state: string, attempt: CustomOAuthAttempt): void {
    // Starting over invalidates the integration's previous attempt: exactly
    // one outstanding authorize URL can land per integration.
    for (const [key, value] of this.byState) {
      if (value.slug === attempt.slug) this.byState.delete(key);
    }
    this.byState.set(state, attempt);
  }

  /** Single use: a state is consumed by its first take, valid or not. */
  take(state: string): CustomOAuthAttempt | null {
    const attempt = this.byState.get(state);
    this.byState.delete(state);
    if (!attempt || Date.now() > attempt.expiresAtMs) return null;
    return attempt;
  }
}

const oauthFailed = (context: string, err: unknown): CustomIntegrationError =>
  new CustomIntegrationError(
    "oauth_failed",
    `${context}: ${err instanceof Error ? err.message : String(err)}`,
  );

/**
 * Discover + register + build the authorize URL for one MCP definition.
 * `existingClient` (from a previous grant's bundle) is reused when it still
 * names this redirect URI, so re-authenticating does not re-register.
 * `statePrefix` (managed pods: `<orgSlug>.<agentSlug>`) rides INSIDE the
 * state so the gateway's public callback can route the returning browser to
 * the right pod statelessly — the random tail keeps the whole value
 * single-use and unguessable.
 */
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
  // The OAuth flow owns its HTTP seam like the executor does (HOU-1083):
  // this host process runs with pi's patched global fetch/dispatcher, which
  // once broke every executor POST through altered message framing.
  // guardedFetch strips the framing headers and lets the current fetch
  // compute them itself, deterministically — hardening against that class
  // for discovery/registration/exchange/refresh alike.
  const fetchFn = opts.fetchFn ?? guardedFetch;
  const { statePrefix } = opts;
  let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>>;
  try {
    info = await discoverOAuthServerInfo(def.endpoint, { fetchFn });
  } catch (err) {
    throw oauthFailed(`could not discover how ${def.name} signs in`, err);
  }
  const metadata = info.authorizationServerMetadata;
  const resource = info.resourceMetadata?.resource;
  // Ask for everything the server advertises, minus what its consent page
  // is known to refuse (`oauthScopeExclusions`): one refused scope fails the
  // whole sign-in on the service's page, where Houston cannot recover it.
  const excluded = new Set(def.oauthScopeExclusions ?? []);
  const scope =
    info.resourceMetadata?.scopes_supported
      ?.filter((name) => !excluded.has(name))
      .join(" ") || undefined;

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
    // The URL ships to the OS opener verbatim, and the server's discovered
    // `authorization_endpoint` is UNTRUSTED input: a `file:`/custom-scheme
    // value would launch an arbitrary protocol handler on the user's machine
    // the moment they press Sign in. Browsers only.
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

/** https everywhere; http only for a loopback dev authorization server. */
const isBrowserSafe = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));

/** Exchange the callback's code for tokens (PKCE-verified). */
export async function settleCustomOAuth(
  attempt: CustomOAuthAttempt,
  code: string,
  fetchOverride?: typeof fetch,
): Promise<CustomOAuthBundle> {
  // Same guarded HTTP seam as the start half (see beginCustomOAuth).
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
