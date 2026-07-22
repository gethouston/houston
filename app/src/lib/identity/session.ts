// The persisted identity session — one JSON blob, stored under the Keychain key
// `houston-auth` on desktop (see identity/session-store.ts, Wave 2) or
// localStorage on web. This is the SHAPE the whole app treats as "signed in".
//
// Shape-tolerant parse (design §6.8 / §6.8-keychain): an upgrading user has a
// stale Supabase session blob under the reused `houston-auth` key. Any blob
// that is not a well-formed Firebase `Session` — a legacy Supabase blob,
// truncated JSON, a future shape — deserializes to `null` (treated as signed
// out) AND emits a structured log. It is NEVER silently swallowed and NEVER
// throws into module load.

import { identityLog } from "./log.ts";

/** How the user authenticated — recorded on the session for analytics + UX. */
export type AuthProvider =
  | "google.com"
  | "microsoft.com"
  | "apple.com"
  | "password"
  | "custom";

const AUTH_PROVIDERS: readonly AuthProvider[] = [
  "google.com",
  "microsoft.com",
  "apple.com",
  "password",
  "custom",
];

export interface Session {
  /** Firebase ID token (JWT). The gateway bearer. */
  idToken: string;
  /** Long-lived Firebase refresh token (not rotated). */
  refreshToken: string;
  /** Firebase UID — `sub` of the ID token; the gateway's opaque user id. */
  uid: string;
  /** Account email (may be "" for a provider that withholds it). */
  email: string;
  /** Whether the provider asserts the email is verified. */
  emailVerified: boolean;
  /** Display name, when the provider supplies one. */
  displayName: string | null;
  /** Provider avatar URL (Google/Microsoft photo), when supplied. */
  photoUrl: string | null;
  /** Which sign-in method minted this session. */
  provider: AuthProvider;
  /** Absolute expiry of `idToken`, epoch milliseconds. */
  expiresAt: number;
}

/**
 * A completed interactive sign-in: the session plus whether GCIP created the
 * account during this exchange (`isNewUser`). Deliberately NOT part of
 * `Session` — being new is a fact about the sign-up moment, not state to
 * persist and re-serve on every launch.
 */
export interface SignInOutcome {
  session: Session;
  isNewUser: boolean;
}

function isAuthProvider(v: unknown): v is AuthProvider {
  return (
    typeof v === "string" && (AUTH_PROVIDERS as readonly string[]).includes(v)
  );
}

function isSessionShape(v: unknown): v is Session {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.idToken === "string" &&
    s.idToken.length > 0 &&
    typeof s.refreshToken === "string" &&
    s.refreshToken.length > 0 &&
    typeof s.uid === "string" &&
    s.uid.length > 0 &&
    typeof s.email === "string" &&
    typeof s.emailVerified === "boolean" &&
    (s.displayName === null || typeof s.displayName === "string") &&
    (s.photoUrl === null || typeof s.photoUrl === "string") &&
    isAuthProvider(s.provider) &&
    typeof s.expiresAt === "number" &&
    Number.isFinite(s.expiresAt)
  );
}

/** Serialize a session for storage. Deterministic, no extra fields. */
export function serializeSession(session: Session): string {
  const canonical: Session = {
    idToken: session.idToken,
    refreshToken: session.refreshToken,
    uid: session.uid,
    email: session.email,
    emailVerified: session.emailVerified,
    displayName: session.displayName,
    photoUrl: session.photoUrl,
    provider: session.provider,
    expiresAt: session.expiresAt,
  };
  return JSON.stringify(canonical);
}

/**
 * Parse a stored blob back into a `Session`. Returns `null` for absent,
 * unparseable, or non-Firebase-shaped input (e.g. a leftover Supabase blob) —
 * always with a structured log so the discard is visible, never a throw.
 */
export function deserializeSession(
  raw: string | null | undefined,
): Session | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    identityLog(
      "warn",
      `discarding unparseable session blob: ${String(e)}`,
      "identity/session",
    );
    return null;
  }
  if (!isSessionShape(parsed)) {
    identityLog(
      "warn",
      "discarding session blob of unknown shape (legacy or corrupt), treating as signed out",
      "identity/session",
    );
    return null;
  }
  return parsed;
}

/** Whether `session.idToken` is within `skewMs` of (or past) expiry. */
export function sessionExpiresWithin(
  session: Session,
  skewMs: number,
): boolean {
  return session.expiresAt - Date.now() <= skewMs;
}
