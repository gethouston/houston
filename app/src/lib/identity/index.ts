// GCP Identity Platform (Firebase Auth) client foundation — project `gethouston`.
//
// Provider-agnostic building blocks for all three sign-in methods (Google,
// Microsoft, email-OTP) across desktop (REST) and, where noted, web/admin
// (firebase-js-sdk). Wave 2 wires these into auth.ts / cloud-login / admin.
// See MIGRATION-DESIGN (knowledge-base/auth-migration.md) for the full plan.

// This barrel exposes only what app-level consumers import THROUGH it. The
// identity leaf modules (pkce, oauth-callback, firebase-rest, desktop-signin,
// log, …) are reached by their sibling modules and by tests via direct
// `.ts`-subpath imports, so they are intentionally NOT re-exported here — a
// slim barrel keeps the public surface honest.

export { identityConfig, isIdentityConfigured } from "./config.ts";
export {
  IdentityError,
  type IdentityErrorCode,
  isIdentityError,
} from "./errors.ts";
// `signInWithPassword` + `PasswordSignInResult` are reserved for the Wave 2c
// admin dashboard (design §2c); kept exported ahead of that consumer landing.
export {
  type PasswordSignInResult,
  signInWithPassword,
} from "./firebase-rest.ts";
export { decodeIdTokenClaims } from "./id-token.ts";
export { startEmailOtp, verifyEmailOtp } from "./otp.ts";
export {
  refreshNow,
  setSessionSink,
  startProactiveRefresh,
  stopProactiveRefresh,
} from "./refresh.ts";
export type { AuthProvider, Session } from "./session.ts";
export {
  clearSession,
  loadSession,
  SESSION_QUERY_KEY,
  saveSession,
  subscribeSession,
} from "./session-store.ts";
