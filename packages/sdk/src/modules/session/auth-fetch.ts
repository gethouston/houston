import type { KeyValueStore } from "../../ports";

export type UnauthorizedReporter = (tokenUsed: string | null) => void;

const CONNECT_AUTH_EXPIRY = Symbol.for("houston.sdk.authFetch.connect");

type Connectable = {
  [CONNECT_AUTH_EXPIRY]?: (report: UnauthorizedReporter) => void;
};

/** Storage key under which the session's auth token is persisted. */
export const SESSION_TOKEN_KEY = "houston.sdk.session.token";

export function normalizeToken(token: string | null): string | null {
  return token !== null && token.length > 0 ? token : null;
}

export async function readToken(
  storage: KeyValueStore,
): Promise<string | null> {
  return normalizeToken(await storage.get(SESSION_TOKEN_KEY));
}

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

export function connectAuthExpiry(
  fetchLike: typeof fetch,
  report: UnauthorizedReporter,
): void {
  (fetchLike as Connectable)[CONNECT_AUTH_EXPIRY]?.(report);
}
