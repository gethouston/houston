import type { IdentityErrorCode } from "./identity/errors.ts";
import { identityLog } from "./identity/log.ts";

const LOG_CTX = "lib/auth-error-bus";

type AuthErrorListener = (code: IdentityErrorCode) => void;
const authErrorListeners = new Set<AuthErrorListener>();

const PENDING_TTL_MS = 10_000;

let pending: { code: IdentityErrorCode; at: number } | null = null;

function deliver(cb: AuthErrorListener, code: IdentityErrorCode): void {
  try {
    cb(code);
  } catch (e) {
    identityLog("warn", `error listener threw: ${e}`, LOG_CTX);
  }
}

export function onAuthError(cb: AuthErrorListener): () => void {
  authErrorListeners.add(cb);
  const held = pending;
  pending = null;
  if (held && Date.now() - held.at <= PENDING_TTL_MS) deliver(cb, held.code);
  return () => {
    authErrorListeners.delete(cb);
  };
}

export function emitAuthError(code: IdentityErrorCode): void {
  if (authErrorListeners.size === 0) {
    pending = { code, at: Date.now() };
    identityLog(
      "warn",
      `no error surface mounted yet; holding ${code}`,
      LOG_CTX,
    );
    return;
  }
  for (const cb of authErrorListeners) deliver(cb, code);
}

export function resetAuthErrorBus(): void {
  pending = null;
}
