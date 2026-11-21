import { createIdentityClient } from "@houston/engine-adapter";
import {
  type AccountLinkPort,
  EmailOtpError,
  type EmailOtpFailure,
  type PendingLink,
  type VerifyLinkOutcome,
} from "@houston/sdk/identity";
import { gatewayUrl } from "./auth-gateway";
import { describeError } from "./describe-error";
import { showErrorToast, showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import {
  IdentityError,
  type IdentityErrorCode,
  isIdentityError,
  type Session,
} from "./identity";
import {
  desktopLinkPending,
  discardDesktopCredential,
} from "./identity/desktop-link";
import { customTokenDesktopSession } from "./identity/desktop-signin";
import { osIsTauri } from "./os-bridge";
import { reportQuietError } from "./quiet-error-report";
import {
  establishDesktopSession,
  establishWebSession,
} from "./sign-in-establish";
import { signOut } from "./sign-out";
import { loadedWebIdentity, webIdentity } from "./web-identity";

const ANALYTICS_PROVIDER = {
  "google.com": "google",
  "microsoft.com": "azure",
  "apple.com": "apple",
  email: "email",
} as const;

export const PROVIDER_NAME = {
  "google.com": "Google",
  "microsoft.com": "Microsoft",
  "apple.com": "Apple",
} as const;

const EXCHANGE_FAILURE: Partial<Record<IdentityErrorCode, EmailOtpFailure>> = {
  network: "network",
  user_disabled: "otp_account_disabled",
};

let watchingFirebase = false;

const port: AccountLinkPort<Session> = {
  async signInWithCustomToken(customToken) {
    try {
      if (osIsTauri()) return await customTokenDesktopSession(customToken);
      const web = await webIdentity();
      if (!watchingFirebase) {
        watchingFirebase = true;
        web.webOnIdTokenChanged((session) =>
          identityClient.sessionChanged(session?.uid ?? null),
        );
      }
      const outcome = await web.webSignInWithCustomToken(customToken);
      if (!outcome) throw new IdentityError("malformed_response");
      return outcome;
    } catch (error) {
      const code = isIdentityError(error) ? EXCHANGE_FAILURE[error.code] : null;
      if (!code) throw error;
      throw new EmailOtpError(code, undefined, { cause: error });
    }
  },
  async linkPending(handle, session) {
    if (osIsTauri()) return desktopLinkPending(handle, session);
    return (await webIdentity()).webLinkPending(handle, session);
  },
  discardPending(handle) {
    if (osIsTauri()) discardDesktopCredential(handle);
    else loadedWebIdentity()?.webDiscardPending(handle);
  },
  async signOutProvisional(session) {
    if (osIsTauri()) return;
    if (loadedWebIdentity()?.webCurrentUid() !== session.uid) return;
    await signOut();
  },
  async establish(session, method) {
    const outcome = { session, isNewUser: false };
    if (osIsTauri())
      return establishDesktopSession(outcome, ANALYTICS_PROVIDER[method]);
    if (loadedWebIdentity()?.webCurrentUid() !== session.uid)
      throw new Error("Firebase no longer holds the session to establish");
    establishWebSession(outcome, ANALYTICS_PROVIDER[method]);
  },
  report({ quiet, reason, cause }) {
    const command = `account_link_${reason}`;
    if (quiet) reportQuietError(quiet, command, describeError(cause), cause);
    else showErrorToast(command, describeError(cause), cause);
  },
};

export const identityClient = createIdentityClient({ gatewayUrl, port });

export async function confirmAccountLink(
  code: string,
): Promise<VerifyLinkOutcome> {
  const view = identityClient.getAccountLink();
  const outcome = await identityClient.verifyAccountLinkCode(code);
  if (
    outcome.kind === "refused" &&
    outcome.refusal === "link_identity_taken" &&
    view.status === "needs_code"
  )
    showExpectedStateToast(
      i18n.t("auth:link.identityTaken.title"),
      i18n.t("auth:link.identityTaken.description", {
        provider: PROVIDER_NAME[view.provider],
      }),
    );
  return outcome;
}

export function startAccountLink(pending: PendingLink): Promise<void> {
  return identityClient.beginAccountLink(pending);
}
