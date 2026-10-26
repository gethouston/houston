// GCP Identity Platform (Firebase Auth) sign-in, project `gethouston`. The public
// auth surface the sign-in UI drives, branching on `osIsTauri()`: desktop uses
// identity REST + loopback/PKCE and gateway email-OTP (session → Keychain, kept
// fresh by the proactive-refresh timer); web uses firebase-js-sdk popup, reached
// lazily via the `@houston/web-identity` alias so desktop never ships it. Every
// failure is a typed `IdentityError`: user calls emit its `.code` to `onAuthError`
// AND rethrow for the caller's `catch`.

import { EmailOtpError, type PendingLink } from "@houston/sdk/identity";
import { identityClient, startAccountLink } from "./account-link";
import { emitAuthError, onAuthError } from "./auth-error-bus";
import {
  IdentityError,
  isIdentityConfigured,
  isIdentityError,
  type SignInOutcome,
  setSessionSink,
} from "./identity";
import { cancelPendingAuthorize } from "./identity/desktop-oauth";
import {
  appleDesktopSession,
  customTokenDesktopSession,
  googleDesktopSession,
  microsoftDesktopSession,
} from "./identity/desktop-signin";
import { identityLog } from "./identity/log";
import { osIsTauri } from "./os-bridge";
import { applyExternalSession, cacheSession } from "./session-cache";
import {
  establishDesktopSession,
  establishWebSession,
} from "./sign-in-establish";
import { signOut } from "./sign-out";
import { webIdentity } from "./web-identity";

setSessionSink((session) => cacheSession(session)); // refresh.ts → app cache

// The account-exists flow's client and code entry (account-link.ts).
export { confirmAccountLink, identityClient } from "./account-link";
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
    // The UI collapses codes into a handful of copy buckets, so without this
    // line the failure's identity (rawCode / HTTP status) exists NOWHERE — a
    // sign-in bug then has zero diagnostics (HOU-1112 was invisible for weeks).
    identityLog(
      "error",
      `sign-in failed: ${err.code}${err.rawCode ? ` (${err.rawCode})` : ""}${
        err.httpStatus ? ` [http ${err.httpStatus}]` : ""
      }`,
      "auth",
    );
    if (opts.emit ?? true) emitAuthError(err.code);
    throw err;
  }
}

type ProviderSignIn = SignInOutcome | PendingLink | null;
type WebIdentity = Awaited<ReturnType<typeof webIdentity>>;

// A provider sign-in either signs in, or met an existing account for the same
// email: the SDK then holds it while the person proves the inbox with a code.
// A `null` result is a benign cancel (superseded / unmount / abandoned tab /
// closed popup): no session write, no emit, no throw.
function providerSignIn(
  desktop: (opts?: SignInOptions) => Promise<ProviderSignIn>,
  web: (identity: WebIdentity) => Promise<ProviderSignIn>,
  analyticsProvider: string,
  opts?: SignInOptions,
): Promise<void> {
  return guardAuthCall(async () => {
    requireConfigured();
    // Web popups return focus naturally, so `onBrowserOpened` is desktop-only.
    const result = osIsTauri()
      ? await desktop(opts)
      : await web(await webIdentity());
    if (!result) return;
    if ("kind" in result) return startAccountLink(result);
    if (osIsTauri()) await establishDesktopSession(result, analyticsProvider);
    else establishWebSession(result, analyticsProvider);
    identityClient.cancelAccountLink(); // an earlier link's notice is stale now
  });
}

export function signInWithGoogle(opts?: SignInOptions): Promise<void> {
  return providerSignIn(
    googleDesktopSession,
    (web) => web.webSignInWithGoogle(),
    "google",
    opts,
  );
}

// "azure" keeps the historical analytics provider value for continuity.
export function signInWithMicrosoft(opts?: SignInOptions): Promise<void> {
  return providerSignIn(
    microsoftDesktopSession,
    (web) => web.webSignInWithMicrosoft(),
    "azure",
    opts,
  );
}

// Desktop Apple is a GCIP-brokered loopback: Apple rejects 127.0.0.1
// redirects on direct OAuth, so GCIP's handler is the registered return URL.
export function signInWithApple(opts?: SignInOptions): Promise<void> {
  return providerSignIn(
    appleDesktopSession,
    (web) => web.webSignInWithApple(),
    "apple",
    opts,
  );
}

// The SDK's email-code failures carry the same codes the sign-in UI renders.
async function emailCodeCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof EmailOtpError)) throw e;
    throw new IdentityError(e.code, { httpStatus: e.status, cause: e });
  }
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
      await emailCodeCall(() => identityClient.sendEmailCode(email));
    },
    { emit: false },
  );
}

/** Step 2: verify the code → gateway custom token → Firebase session. */
export function verifyEmailOtp(email: string, code: string): Promise<void> {
  return guardAuthCall(
    async () => {
      requireConfigured();
      const customToken = await emailCodeCall(() =>
        identityClient.verifyEmailCode(email, code),
      );
      if (osIsTauri()) {
        const signIn = await customTokenDesktopSession(customToken);
        await establishDesktopSession(signIn, "email");
      } else {
        const web = await webIdentity();
        establishWebSession(
          await web.webSignInWithCustomToken(customToken),
          "email",
        );
      }
      identityClient.cancelAccountLink(); // an earlier link's notice is stale now
    },
    { emit: false }, // EmailSignIn renders this error inline (no duplicate).
  );
}

function requireConfigured(): void {
  if (!isIdentityConfigured()) {
    throw new IdentityError("api_key_invalid");
  }
}
