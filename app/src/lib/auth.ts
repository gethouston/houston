// GCP Identity Platform (Firebase Auth) sign-in, project `gethouston`. The public
// auth surface the sign-in UI drives, branching on `osIsTauri()`: desktop uses
// identity REST + loopback/PKCE and gateway email-OTP (session → Keychain, kept
// fresh by the proactive-refresh timer); web uses firebase-js-sdk popup, reached
// lazily via the `@houston/web-identity` alias so desktop never ships it. Every
// failure is a typed `IdentityError`: user calls emit its `.code` to `onAuthError`
// AND rethrow for the caller's `catch`.

import { analytics } from "./analytics";
import { emitAuthError, onAuthError } from "./auth-error-bus";
import { gatewayUrl } from "./auth-gateway";
import {
  clearSession,
  IdentityError,
  identityConfig,
  isIdentityConfigured,
  isIdentityError,
  SESSION_QUERY_KEY,
  type Session,
  saveSession,
  setSessionSink,
  startEmailOtp,
  startProactiveRefresh,
  stopProactiveRefresh,
  verifyEmailOtp as verifyEmailOtpGateway,
} from "./identity";
import { cancelPendingAuthorize } from "./identity/desktop-oauth";
import {
  customTokenDesktopSession,
  googleDesktopSession,
  microsoftDesktopSession,
} from "./identity/desktop-signin";
import { logger } from "./logger";
import { osIsTauri } from "./os-bridge";
import { queryClient } from "./query-client";
import { clearPersistedLocalData } from "./query-persist";

setSessionSink((session) => cacheSession(session)); // refresh.ts → app cache

function cacheSession(session: Session | null): void {
  queryClient.setQueryData<Session | null>(SESSION_QUERY_KEY, session);
}

// Public re-exports: the post-hand-off error bus (auth-error-bus.ts) and the
// loopback-cancel seam (desktop-oauth.ts) the sign-in screen calls on unmount —
// benign on web and when nothing is pending.
export { cancelPendingAuthorize, onAuthError };

/** Options threaded from the sign-in UI into a provider sign-in. */
export interface SignInOptions {
  /** Fires the moment the system browser opens (frees the sign-in buttons). */
  onBrowserOpened?: () => void;
}

// Run a user-initiated auth call: normalize failures to a typed code + rethrow.
// `emit` broadcasts the code to `onAuthError` subscribers (SignInScreen's shared
// error line) — ON for the OAuth flows, OFF for email-OTP (EmailSignIn renders
// inline, so emitting too would double-render the same red text).
async function guardAuthCall(
  fn: () => Promise<void>,
  opts: { emit?: boolean } = {},
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = isIdentityError(e)
      ? e
      : new IdentityError("unknown", { cause: e });
    if (opts.emit ?? true) emitAuthError(err.code);
    throw err;
  }
}

async function establishDesktopSession(
  session: Session,
  analyticsProvider: string,
): Promise<void> {
  await saveSession(session);
  cacheSession(session);
  startProactiveRefresh();
  analytics.track("user_signed_in", { provider: analyticsProvider });
  logger.info(`[auth] signed in (${session.provider}) as ${session.email}`);
}

// Cache a web session (or a benign null popup-cancel) and track it.
function establishWebSession(
  session: Session | null,
  analyticsProvider: string,
): void {
  if (!session) return; // popup cancelled — no error, no cache write
  cacheSession(session);
  analytics.track("user_signed_in", { provider: analyticsProvider });
}

// Lazy-load the web SDK surface (a no-op stub on desktop; never reached there).
const loadWebIdentity = () => import("@houston/web-identity");

export function signInWithGoogle(opts?: SignInOptions): Promise<void> {
  return guardAuthCall(async () => {
    requireConfigured();
    if (osIsTauri()) {
      // A `null` session = benign cancel (superseded / unmount / abandoned tab):
      // no session write, no emit, no throw — mirroring the web popup-cancel path.
      const session = await googleDesktopSession(opts);
      if (session) await establishDesktopSession(session, "google");
      return;
    }
    // Web popup returns focus naturally, so `onBrowserOpened` is not needed here.
    const web = await loadWebIdentity();
    web.initWebAuth(identityConfig);
    establishWebSession(await web.webSignInWithGoogle(), "google");
  });
}

export function signInWithMicrosoft(opts?: SignInOptions): Promise<void> {
  return guardAuthCall(async () => {
    requireConfigured();
    if (osIsTauri()) {
      // "azure" keeps the historical analytics provider value for continuity.
      // A `null` session is a benign cancel (see signInWithGoogle).
      const session = await microsoftDesktopSession(opts);
      if (session) await establishDesktopSession(session, "azure");
      return;
    }
    const web = await loadWebIdentity();
    web.initWebAuth(identityConfig);
    establishWebSession(await web.webSignInWithMicrosoft(), "azure");
  });
}

/**
 * Passwordless email sign-in, step 1: ask the gateway to mail a 6-digit code.
 * `emit: false` — `EmailSignIn` renders this error inline, so emitting to
 * `onAuthError` too would double-render the same message.
 */
export function sendEmailOtp(email: string): Promise<void> {
  return guardAuthCall(
    async () => {
      requireConfigured();
      await startEmailOtp(gatewayUrl(), email);
    },
    { emit: false },
  );
}

/** Step 2: verify the code → gateway custom token → Firebase session. */
export function verifyEmailOtp(email: string, code: string): Promise<void> {
  return guardAuthCall(
    async () => {
      requireConfigured();
      const { customToken } = await verifyEmailOtpGateway(
        gatewayUrl(),
        email,
        code,
      );
      if (osIsTauri()) {
        const session = await customTokenDesktopSession(customToken);
        await establishDesktopSession(session, "email");
        return;
      }
      const web = await loadWebIdentity();
      web.initWebAuth(identityConfig);
      establishWebSession(
        await web.webSignInWithCustomToken(customToken),
        "email",
      );
    },
    { emit: false }, // EmailSignIn renders this error inline (no duplicate).
  );
}

// Sign out: stop refresh + clear the persisted (desktop) / SDK (web) session, then
// wipe local per-user data and reset analytics. A failed remote/keychain clear is
// logged (never silent) but never blocks local cleanup.
export async function signOut(): Promise<void> {
  try {
    if (osIsTauri()) {
      stopProactiveRefresh();
      await clearSession();
    } else {
      const web = await loadWebIdentity();
      await web.webSignOut();
    }
  } catch (e) {
    logger.warn(`[auth] sign-out clear failed; local cleanup continues: ${e}`);
  }
  cacheSession(null);
  // Wipe locally persisted per-user data so nothing lingers after sign-out (HOU-712).
  await clearPersistedLocalData();
  analytics.track("user_signed_out");
  analytics.reset();
}

function requireConfigured(): void {
  if (!isIdentityConfigured()) {
    throw new IdentityError("api_key_invalid");
  }
}
