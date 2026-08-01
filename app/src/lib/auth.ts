// GCP Identity Platform (Firebase Auth) sign-in, project `gethouston`. The public
// auth surface the sign-in UI drives, branching on `osIsTauri()`: desktop uses
// identity REST + loopback/PKCE and gateway email-OTP (session → Keychain, kept
// fresh by the proactive-refresh timer); web uses firebase-js-sdk popup, reached
// lazily via the `@houston/web-identity` alias so desktop never ships it. Every
// failure is a typed `IdentityError`: user calls emit its `.code` to `onAuthError`
// AND rethrow for the caller's `catch`.

import { emitAuthError, onAuthError } from "./auth-error-bus";
import { gatewayUrl } from "./auth-gateway";
import {
  IdentityError,
  identityConfig,
  isIdentityConfigured,
  isIdentityError,
  setSessionSink,
  startEmailOtp,
  verifyEmailOtp as verifyEmailOtpGateway,
} from "./identity";
import { cancelPendingAuthorize } from "./identity/desktop-oauth";
import {
  appleDesktopSession,
  customTokenDesktopSession,
  googleDesktopSession,
  microsoftDesktopSession,
} from "./identity/desktop-signin";
import { osIsTauri } from "./os-bridge";
import { applyExternalSession, cacheSession } from "./session-cache";
import {
  establishDesktopSession,
  establishWebSession,
} from "./sign-in-establish";
import { signOut } from "./sign-out";

setSessionSink((session) => cacheSession(session)); // refresh.ts → app cache

// Public re-exports, so `lib/auth` stays the ONE auth front door: the session
// cache mirror (session-cache.ts), the sign-out lifecycle (sign-out.ts), the
// post-hand-off error bus (auth-error-bus.ts), and the loopback-cancel seam
// (desktop-oauth.ts) the sign-in screen calls on unmount — the last two benign
// on web and when nothing is pending.
export { applyExternalSession, cancelPendingAuthorize, onAuthError, signOut };

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

// Lazy-load the web SDK surface (a no-op stub on desktop; never reached there).
const loadWebIdentity = () => import("@houston/web-identity");

export function signInWithGoogle(opts?: SignInOptions): Promise<void> {
  return guardAuthCall(async () => {
    requireConfigured();
    if (osIsTauri()) {
      // A `null` session = benign cancel (superseded / unmount / abandoned tab):
      // no session write, no emit, no throw — mirroring the web popup-cancel path.
      const signIn = await googleDesktopSession(opts);
      if (signIn) await establishDesktopSession(signIn, "google");
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
      const signIn = await microsoftDesktopSession(opts);
      if (signIn) await establishDesktopSession(signIn, "azure");
      return;
    }
    const web = await loadWebIdentity();
    web.initWebAuth(identityConfig);
    establishWebSession(await web.webSignInWithMicrosoft(), "azure");
  });
}

export function signInWithApple(opts?: SignInOptions): Promise<void> {
  return guardAuthCall(async () => {
    requireConfigured();
    if (osIsTauri()) {
      // GCIP-brokered loopback (Apple rejects 127.0.0.1 redirects on direct
      // OAuth, so GCIP's handler is the registered return URL). A `null`
      // session is a benign cancel (see signInWithGoogle).
      const signIn = await appleDesktopSession(opts);
      if (signIn) await establishDesktopSession(signIn, "apple");
      return;
    }
    const web = await loadWebIdentity();
    web.initWebAuth(identityConfig);
    establishWebSession(await web.webSignInWithApple(), "apple");
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
        const signIn = await customTokenDesktopSession(customToken);
        await establishDesktopSession(signIn, "email");
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

function requireConfigured(): void {
  if (!isIdentityConfigured()) {
    throw new IdentityError("api_key_invalid");
  }
}
