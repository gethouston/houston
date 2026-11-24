import type { ModuleContext } from "../../module-context";
import {
  connectAuthExpiry,
  createAuthFetch,
  normalizeToken,
  readToken,
  SESSION_TOKEN_KEY,
  writeToken,
} from "./auth-fetch";

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

export function createSessionModule(ctx: ModuleContext): SessionModule {
  const { store, config, authExpiry } = ctx;
  const { baseUrl, ports } = config;
  const { storage, logger } = ports;

  connectAuthExpiry(ports.fetch, (tokenUsed) =>
    authExpiry.notifyExpired(tokenUsed),
  );

  let currentToken: string | null = null;
  let tokenSetByHost = false;

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

  publishConnection("idle");

  async function hydrate(): Promise<void> {
    let stored: string | null = null;
    try {
      stored = await readToken(storage);
    } catch (err) {
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
