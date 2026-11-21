import { identityLog } from "./log.ts";

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
  idToken: string;
  refreshToken: string;
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  provider: AuthProvider;
  expiresAt: number;
}

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

export function sessionExpiresWithin(
  session: Session,
  skewMs: number,
): boolean {
  return session.expiresAt - Date.now() <= skewMs;
}
