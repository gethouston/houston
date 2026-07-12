// Operator dashboard auth logic (GCIP / Firebase Auth, project `gethouston`).
//
// Replaces the retired Supabase admin login. Pure, framework-free helpers so the
// session shaping, refresh scheduling, persistence parsing, and error copy are
// unit-testable; the React glue lives in `use-admin-auth.ts`.
//
// ADMIN PROVISIONING: operator accounts are created by the platform admin in
// GCIP (Firebase console or the Admin SDK) — there is NO self-signup here.
// Email+password sign-in relies on the platform's `allow_password_signup` being
// enabled (see infra `identity.tf`); this UI only signs EXISTING accounts in.
//
// Both sign-in methods (REST `signInWithPassword` for email+password, the
// `@houston/web-identity` popup for Google) yield a Firebase ID token. A single
// proactive REST refresh loop — the same `refreshIdToken` the desktop
// `identity/refresh.ts` uses — keeps it fresh; the dashboard sends that token as
// the control-plane bearer.

import {
  IdentityError,
  isIdentityError,
  type PasswordSignInResult,
  type Session,
} from "@houston/app/lib/identity";

/** localStorage key holding the persisted admin session (reload survival). */
export const ADMIN_SESSION_KEY = "houston-admin-session";

/** Refresh this long before `expiresAt` so a call never rides an expired token. */
export const REFRESH_SKEW_MS = 5 * 60_000;

/** Retry delay after a transient (network) refresh failure. */
export const REFRESH_RETRY_MS = 30_000;

/** The minimal session the dashboard needs: a bearer token + the means to
 * refresh it, plus the operator email for the header. */
export interface AdminSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

/** Build an `AdminSession` from a REST email+password result. */
export function sessionFromPassword(r: PasswordSignInResult): AdminSession {
  return {
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: r.expiresAt,
    email: r.email,
  };
}

/** Build an `AdminSession` from a `@houston/web-identity` popup `Session`. */
export function sessionFromIdentity(s: Session): AdminSession {
  return {
    idToken: s.idToken,
    refreshToken: s.refreshToken,
    expiresAt: s.expiresAt,
    email: s.email,
  };
}

/** ms until the next proactive refresh should fire (never negative). */
export function refreshDelayMs(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now - REFRESH_SKEW_MS);
}

/** A refresh failure is terminal (real sign-out) only for these codes; every
 * other failure is transient and must NOT sign the operator out. */
export function isTerminalRefreshError(e: unknown): boolean {
  return (
    isIdentityError(e) &&
    (e.code === "invalid_refresh_token" || e.code === "token_expired")
  );
}

/** Parse a persisted session, tolerating a corrupt/legacy blob (→ `null`,
 * treated as signed-out — never throws). */
export function parseStoredSession(raw: string | null): AdminSession | null {
  if (!raw) return null;
  let v: Partial<AdminSession>;
  try {
    v = JSON.parse(raw) as Partial<AdminSession>;
  } catch {
    return null; // corrupt blob → signed out (Risk #8: unknown shape = signed out)
  }
  if (
    typeof v.idToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.expiresAt === "number" &&
    typeof v.email === "string"
  ) {
    return {
      idToken: v.idToken,
      refreshToken: v.refreshToken,
      expiresAt: v.expiresAt,
      email: v.email,
    };
  }
  return null;
}

/** User-facing copy for a sign-in / refresh failure. Branches on the stable
 * `IdentityError.code` (never a raw GCIP string) so the operator sees the real
 * reason, not a swallowed generic. */
export function adminAuthMessage(e: unknown): string {
  if (!(e instanceof IdentityError)) {
    return e instanceof Error ? e.message : String(e);
  }
  switch (e.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "user_disabled":
      return "This account has been disabled.";
    case "operation_not_allowed":
      return "This sign-in method isn't enabled for operators.";
    case "too_many_attempts":
      return "Too many attempts. Please wait a moment and try again.";
    case "api_key_invalid":
      return "Sign-in is misconfigured (invalid Firebase API key).";
    case "network":
      return "Network error. Check your connection and try again.";
    default:
      return `Sign-in failed (${e.code}).`;
  }
}
