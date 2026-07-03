/**
 * Session module — token custody + the `connection` view-model.
 *
 * Platform OAuth stays app-side: the host obtains and refreshes the auth token
 * and hands it to the SDK via the `session/setToken` command (or the typed
 * {@link SessionModule.setToken} facade). This module is the token's custodian
 * inside the SDK — it persists it, mirrors it for synchronous reads, keeps the
 * `connection` view-model in sync, and surfaces 401s so the host knows to
 * refresh. It does NOT drive an OAuth flow and does NOT signal transport
 * liveness (the streams that own a connection do that).
 *
 * How the token reaches requests: see {@link createAuthFetch} in `auth-fetch.ts`.
 * The token is persisted to the shared, injected `storage`; the auth-fetch
 * wrapper the host composes into `ports.fetch` reads it per request, so a
 * refresh applies without rebuilding the engine client.
 *
 * 401 surfacing is wired here too: this module binds the auth-fetch's 401
 * classifier to the shared {@link AuthExpiryNotifier} (via `connectAuthExpiry`),
 * because it holds both `ports.fetch` and the notifier and is composed first.
 * The auth-fetch reports the token each failing request carried, so a stale 401
 * that lands after a proactive rotation is suppressed instead of storming.
 */

import type { ModuleContext } from "../../module-context";
import {
  connectAuthExpiry,
  createAuthFetch,
  normalizeToken,
  readToken,
  SESSION_TOKEN_KEY,
  writeToken,
} from "./auth-fetch";

// Host-facing: the host composes `createAuthFetch` into `ports.fetch` (keyed on
// `SESSION_TOKEN_KEY`) before constructing the SDK. The 401 classifier and the
// `session/tokenExpired` constant are canonical in `../../auth-expiry`.
export { createAuthFetch, SESSION_TOKEN_KEY };

/** Scope of the connection view-model snapshot. */
export const CONNECTION_SCOPE = "connection";
/** Command type that sets or clears the auth token. */
export const SET_TOKEN_COMMAND = "session/setToken";

/** `idle` until the persisted token has been read; `ready` thereafter. */
export type ConnectionStatus = "idle" | "ready";

/** Reactive snapshot published on the `connection` scope. Plain JSON. */
export interface ConnectionViewModel {
  status: ConnectionStatus;
  baseUrl: string;
  hasToken: boolean;
}

/** The `session/setToken` command payload. */
export interface SetTokenPayload {
  token: string | null;
}

/** Typed facade returned by {@link createSessionModule} (surfaced as `sdk.session`). */
export interface SessionModule {
  /** Set or clear the auth token: persists it and republishes `connection`. */
  setToken(token: string | null): Promise<void>;
  /** Current connection view-model, or `undefined` before the first publish. */
  getConnection(): ConnectionViewModel | undefined;
  /** Resolves once the persisted token has been hydrated on startup. */
  whenReady(): Promise<void>;
}

/** Validate the untrusted `session/setToken` payload; throws on a bad shape. */
function parseSetToken(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(
      "session/setToken: payload must be { token: string | null }",
    );
  }
  const { token } = payload as Record<string, unknown>;
  if (token === null) return null;
  if (typeof token === "string") return token;
  throw new Error("session/setToken: token must be a string or null");
}

/** Wire the session module into the SDK. Registers `session/setToken`. */
export function createSessionModule(ctx: ModuleContext): SessionModule {
  const { store, config, authExpiry } = ctx;
  const { baseUrl, ports } = config;
  const { storage, logger } = ports;

  // Bind the auth-fetch's 401 classifier to the shared notifier. The auth-fetch
  // knows the token each request carried, so it is the authoritative reporter of
  // an expiry; the notifier suppresses stale (already-rotated) and tokenless
  // 401s. This runs here because the session module is composed first and holds
  // both `ports.fetch` and the notifier. A no-op if `ports.fetch` isn't an
  // auth-fetch (a host with no bearer auth, where a 401 can't be a token expiry).
  connectAuthExpiry(ports.fetch, (tokenUsed) =>
    authExpiry.notifyExpired(tokenUsed),
  );

  /** Synchronous mirror of the persisted token, for the VM and 401 dedupe. */
  let currentToken: string | null = null;
  /** True once the host has set a token, so a late hydrate can't clobber it. */
  let tokenSetByHost = false;

  /** Keep the shared 401 dedupe keyed on the token every module now sees. */
  function trackToken(next: string | null): void {
    currentToken = next;
    authExpiry.setToken(next);
  }

  function publishConnection(status: ConnectionStatus): void {
    const vm: ConnectionViewModel = {
      status,
      baseUrl,
      hasToken: currentToken !== null,
    };
    store.publish(CONNECTION_SCOPE, vm);
  }

  // Publish an initial snapshot synchronously so `connection` is never absent,
  // then hydrate the persisted token and flip to `ready`.
  publishConnection("idle");

  async function hydrate(): Promise<void> {
    let stored: string | null = null;
    try {
      stored = await readToken(storage);
    } catch (err) {
      // Log-only is correct here (not a silent failure): this is startup
      // bootstrap with no user action behind it. A storage read fault can't be
      // surfaced as a toast (no UI yet, nothing the user did), so we record it
      // and proceed logged-out — the host can still set a token afterwards.
      logger.error("session: failed to read persisted token", {
        error: String(err),
      });
    }
    if (!tokenSetByHost) trackToken(stored);
    publishConnection("ready");
  }

  const ready = hydrate();

  async function setToken(token: string | null): Promise<void> {
    const next = normalizeToken(token);
    tokenSetByHost = true;
    await writeToken(storage, next);
    trackToken(next);
    publishConnection("ready");
  }

  ctx.registerCommand(SET_TOKEN_COMMAND, async (payload) => {
    await setToken(parseSetToken(payload));
  });

  return {
    setToken,
    getConnection: () =>
      store.getSnapshot(CONNECTION_SCOPE) as ConnectionViewModel | undefined,
    whenReady: () => ready,
  };
}
