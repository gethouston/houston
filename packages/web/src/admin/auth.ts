import {
  IdentityError,
  isIdentityError,
  type PasswordSignInResult,
  type Session,
} from "@houston/app/lib/identity";

export const ADMIN_SESSION_KEY = "houston-admin-session";

export const REFRESH_SKEW_MS = 5 * 60_000;

export const REFRESH_RETRY_MS = 30_000;

export interface AdminSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

export function sessionFromPassword(r: PasswordSignInResult): AdminSession {
  return {
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: r.expiresAt,
    email: r.email,
  };
}

export function sessionFromIdentity(s: Session): AdminSession {
  return {
    idToken: s.idToken,
    refreshToken: s.refreshToken,
    expiresAt: s.expiresAt,
    email: s.email,
  };
}

export function refreshDelayMs(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now - REFRESH_SKEW_MS);
}

export function isTerminalRefreshError(e: unknown): boolean {
  return (
    isIdentityError(e) &&
    (e.code === "invalid_refresh_token" || e.code === "token_expired")
  );
}

export function parseStoredSession(raw: string | null): AdminSession | null {
  if (!raw) return null;
  let v: Partial<AdminSession>;
  try {
    v = JSON.parse(raw) as Partial<AdminSession>;
  } catch {
    return null;
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

export function persistSession(session: AdminSession | null): void {
  try {
    if (session) {
      window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  } catch (e) {
    console.warn("[admin] could not persist session:", e);
  }
}

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
    case "identity_already_linked":
      return "This Google address already has an account. Sign in with your password.";
    default:
      return `Sign-in failed (${e.code}).`;
  }
}
