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

setSessionSink((session) => cacheSession(session));

export { confirmAccountLink, identityClient } from "./account-link";
export { applyExternalSession, cancelPendingAuthorize, onAuthError, signOut };

export interface SignInOptions {
  onBrowserOpened?: () => void;
}

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

function providerSignIn(
  desktop: (opts?: SignInOptions) => Promise<ProviderSignIn>,
  web: (identity: WebIdentity) => Promise<ProviderSignIn>,
  analyticsProvider: string,
  opts?: SignInOptions,
): Promise<void> {
  return guardAuthCall(async () => {
    requireConfigured();
    const result = osIsTauri()
      ? await desktop(opts)
      : await web(await webIdentity());
    if (!result) return;
    if ("kind" in result) return startAccountLink(result);
    if (osIsTauri()) await establishDesktopSession(result, analyticsProvider);
    else establishWebSession(result, analyticsProvider);
    identityClient.cancelAccountLink();
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

export function signInWithMicrosoft(opts?: SignInOptions): Promise<void> {
  return providerSignIn(
    microsoftDesktopSession,
    (web) => web.webSignInWithMicrosoft(),
    "azure",
    opts,
  );
}

export function signInWithApple(opts?: SignInOptions): Promise<void> {
  return providerSignIn(
    appleDesktopSession,
    (web) => web.webSignInWithApple(),
    "apple",
    opts,
  );
}

async function emailCodeCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof EmailOtpError)) throw e;
    throw new IdentityError(e.code, { httpStatus: e.status, cause: e });
  }
}

export function sendEmailOtp(email: string): Promise<void> {
  return guardAuthCall(
    async () => {
      requireConfigured();
      await emailCodeCall(() => identityClient.sendEmailCode(email));
    },
    { emit: false },
  );
}

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
      identityClient.cancelAccountLink();
    },
    { emit: false },
  );
}

function requireConfigured(): void {
  if (!isIdentityConfigured()) {
    throw new IdentityError("api_key_invalid");
  }
}
