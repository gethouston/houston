/**
 * Token custody transport — the live-token injection mechanism, and the
 * authoritative 401 classifier.
 *
 * The runtime-client's own auth is `token`-in-config: baked in at construction,
 * so rotating it means rebuilding the client (and dropping in-flight streams).
 * The web control-plane avoids that with a `liveToken` wrapper that reads the
 * current token *per request* from a mutable holder, so a silent refresh is
 * picked up without touching the client. This is the SDK's portable equivalent
 * of that pattern.
 *
 * The shared, injected {@link KeyValueStore} is the single source of truth for
 * the token: {@link createSessionModule}'s `setToken` writes it, and the fetch
 * returned by {@link createAuthFetch} reads it on every request and stamps the
 * `Authorization: Bearer` header. Because the read happens per request, token
 * rotation applies to the very next request with no client rebuild.
 *
 * **This wrapper is also the one place that knows which token each request
 * carried**, so it is where 401s are classified for the `session/tokenExpired`
 * signal. On a 401 it reports the token it stamped (or `null` when the request
 * went out tokenless) to the {@link AuthExpiryNotifier}; that reporter is bound
 * *after* construction via {@link connectAuthExpiry}, because the notifier is
 * born inside the kernel while this wrapper is composed by the host beforehand.
 * The session module (constructed first) owns that wiring. Threading the
 * request's own token — not the token that is current when the late 401 lands —
 * is what lets the notifier suppress a stale 401 after a proactive rotation.
 *
 * Wiring: the host composes this wrapper into `SdkPorts.fetch` *before*
 * constructing the SDK — `ports.fetch = createAuthFetch(baseFetch, storage)` —
 * because the kernel builds the engine client with `config.ports.fetch` and
 * exposes no post-construction token setter. Both the wrapper and the session
 * module reach the token through the same injected `storage`, so there is no
 * global holder and no chicken-and-egg between the two.
 */

import type { KeyValueStore } from "../../ports";

/** Reports a 401 for a request that carried `tokenUsed` (`null` if tokenless). */
export type UnauthorizedReporter = (tokenUsed: string | null) => void;

/**
 * Symbol seam carried on a {@link createAuthFetch} result so the notifier can be
 * bound after construction. Off any other `fetch`, {@link connectAuthExpiry} is
 * a no-op — only an auth-fetch stamps tokens, so only it can attribute a 401.
 */
const CONNECT_AUTH_EXPIRY = Symbol.for("houston.sdk.authFetch.connect");

type Connectable = {
  [CONNECT_AUTH_EXPIRY]?: (report: UnauthorizedReporter) => void;
};

/** Storage key under which the session's auth token is persisted. */
export const SESSION_TOKEN_KEY = "houston.sdk.session.token";

/** Collapse an absent or empty token to `null` so "" never counts as a token. */
export function normalizeToken(token: string | null): string | null {
  return token !== null && token.length > 0 ? token : null;
}

/** Read the persisted token, normalized (empty/absent -> `null`). */
export async function readToken(
  storage: KeyValueStore,
): Promise<string | null> {
  return normalizeToken(await storage.get(SESSION_TOKEN_KEY));
}

/** Persist `token`, or clear the key when it is `null`/empty. */
export async function writeToken(
  storage: KeyValueStore,
  token: string | null,
): Promise<void> {
  const next = normalizeToken(token);
  if (next === null) await storage.delete(SESSION_TOKEN_KEY);
  else await storage.set(SESSION_TOKEN_KEY, next);
}

/**
 * Wrap `baseFetch` so every request carries the currently-persisted bearer
 * token. When no token is stored the request passes through untouched (the
 * pre-login / self-host-no-auth case). Existing request headers are preserved.
 *
 * A 401 response is reported to the bound {@link UnauthorizedReporter} (see
 * {@link connectAuthExpiry}) carrying the token this wrapper stamped — or `null`
 * when the request went out tokenless — so the notifier can tell a genuine
 * current-token expiry from a stale or tokenless 401. The response is returned
 * untouched; only its status is read, so the body stays intact for the caller.
 */
export function createAuthFetch(
  baseFetch: typeof fetch,
  storage: KeyValueStore,
): typeof fetch {
  let report: UnauthorizedReporter | null = null;

  const authFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = await readToken(storage);
    const res =
      token === null
        ? await baseFetch(input, init)
        : await baseFetch(input, {
            ...init,
            headers: withBearer(input, init, token),
          });
    if (res.status === 401) report?.(token);
    return res;
  }) as typeof fetch & Connectable;

  authFetch[CONNECT_AUTH_EXPIRY] = (r) => {
    report = r;
  };
  return authFetch;
}

/** Merge a `Bearer` auth header onto a request's headers, preserving the rest. */
function withBearer(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string,
): Headers {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/**
 * Bind `report` as the 401 reporter of an auth-fetch built by
 * {@link createAuthFetch}. A no-op for any other `fetch` (nothing to attribute a
 * 401 to). The session module wires this to the shared auth notifier.
 */
export function connectAuthExpiry(
  fetchLike: typeof fetch,
  report: UnauthorizedReporter,
): void {
  (fetchLike as Connectable)[CONNECT_AUTH_EXPIRY]?.(report);
}
