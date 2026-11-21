export type { PendingLink } from "@houston/sdk/identity";
export { identityConfig, isIdentityConfigured } from "./config.ts";
export {
  IdentityError,
  type IdentityErrorCode,
  isIdentityError,
} from "./errors.ts";
export {
  type PasswordSignInResult,
  refreshIdToken,
  signInWithPassword,
  type TokenSignInResult,
} from "./firebase-rest.ts";
export { decodeIdTokenClaims } from "./id-token.ts";
export { refreshNow, setSessionSink } from "./refresh.ts";
export {
  startProactiveRefresh,
  stopProactiveRefresh,
} from "./refresh-timer.ts";
export type { AuthProvider, Session, SignInOutcome } from "./session.ts";
export type { SessionLoadState } from "./session-load.ts";
export {
  clearSession,
  loadSession,
  loadSessionState,
  SESSION_QUERY_KEY,
  saveSession,
  subscribeSession,
} from "./session-store.ts";
