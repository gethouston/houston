// GCP Identity Platform (Firebase Auth) client foundation — project `gethouston`.
//
// Provider-agnostic building blocks for all three sign-in methods (Google,
// Microsoft, email-OTP) across desktop (REST) and, where noted, web/admin
// (firebase-js-sdk). Wave 2 wires these into auth.ts / cloud-login / admin.
// See MIGRATION-DESIGN (knowledge-base/auth-migration.md) for the full plan.

export {
  type IdentityConfig,
  identityConfig,
  identityConfigured,
  isIdentityConfigured,
  resolveIdentityConfig,
} from "./config.ts";
export {
  IdentityError,
  type IdentityErrorCode,
  isIdentityError,
  mapGcipCode,
} from "./errors.ts";
export {
  type IdpProviderId,
  type IdpSignInResult,
  type PasswordSignInResult,
  refreshIdToken,
  signInWithCustomToken,
  signInWithIdp,
  signInWithPassword,
  type TokenSignInResult,
} from "./firebase-rest.ts";
export { decodeIdTokenClaims, type IdTokenClaims } from "./id-token.ts";
export {
  type IdentityLogLevel,
  type IdentityLogSink,
  setIdentityLogSink,
} from "./log.ts";
export { startEmailOtp, type VerifyOtpResult, verifyEmailOtp } from "./otp.ts";
export {
  type AuthProvider,
  deserializeSession,
  type Session,
  serializeSession,
  sessionExpiresWithin,
} from "./session.ts";
