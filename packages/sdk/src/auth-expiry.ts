import { EngineError } from "@houston/runtime-client";
import type { ScopeStore } from "./store";

export const TOKEN_EXPIRED_EVENT = "session/tokenExpired";

export function isUnauthorized(err: unknown): boolean {
  if (err instanceof EngineError) return err.status === 401;
  if (typeof err === "object" && err !== null) {
    return (err as { status?: unknown }).status === 401;
  }
  return false;
}

export interface AuthExpiryNotifier {
  setToken(token: string | null): void;
  notifyExpired(tokenUsed?: string | null): void;
}

export function createAuthExpiryNotifier(
  store: ScopeStore,
): AuthExpiryNotifier {
  let token: string | null = null;
  let firedForToken: string | null = null;
  let hasFired = false;

  return {
    setToken(next: string | null): void {
      token = next;
    },
    notifyExpired(tokenUsed?: string | null): void {
      if (tokenUsed === undefined) return;
      if (tokenUsed === null) return;
      if (tokenUsed !== token) return;
      if (hasFired && firedForToken === tokenUsed) return;
      hasFired = true;
      firedForToken = tokenUsed;
      store.emitEvent({ type: TOKEN_EXPIRED_EVENT });
    },
  };
}
