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

export const CONNECTION_SCOPE = "connection";
export const SET_TOKEN_COMMAND = "session/setToken";

export type ConnectionStatus = "idle" | "ready";

export interface ConnectionViewModel {
  status: ConnectionStatus;
  baseUrl: string;
  hasToken: boolean;
}

export interface SetTokenPayload {
  token: string | null;
}

export interface SessionModule {
  setToken(token: string | null): Promise<void>;
  getConnection(): ConnectionViewModel | undefined;
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
