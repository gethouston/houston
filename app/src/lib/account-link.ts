// The app's binding of the SDK identity module: the platform port the
// account-exists flow drives, and the calls the sign-in screen makes. The
// flow's state lives in the SDK, so a link finishes even when the sign-in
// screen unmounts (web mirrors the email-code session into the app as soon as
// Firebase signs it in).

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

/** The analytics `provider` value each sign-in method has always sent. */
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

// The SDK's code-error vocabulary: an unreachable Identity Platform is the
// same offline state as an unreachable gateway, and a disabled account the
// same refusal the gateway answers for one.
const EXCHANGE_FAILURE: Partial<Record<IdentityErrorCode, EmailOtpFailure>> = {
  network: "network",
  user_disabled: "otp_account_disabled",
};

const port: AccountLinkPort<Session> = {
  async signInWithCustomToken(customToken) {
    try {
      if (osIsTauri()) return await customTokenDesktopSession(customToken);
      const outcome = await (await webIdentity()).webSignInWithCustomToken(
        customToken,
      );
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
    // On web the held credential came from the loaded surface, so it is there.
    if (osIsTauri()) discardDesktopCredential(handle);
    else loadedWebIdentity()?.webDiscardPending(handle);
  },
  async signOutProvisional(session) {
    // Desktop never stored or published the email-code session. Web mirrored
    // it into the app the moment Firebase signed in, so it gets the full
    // sign-out that wipes what loaded under it, unless another account has
    // signed in since.
    if (osIsTauri()) return;
    if (loadedWebIdentity()?.webCurrentUid() !== session.uid) return;
    await signOut();
  },
  async establish(session, method) {
    const outcome = { session, isNewUser: false };
    if (osIsTauri())
      await establishDesktopSession(outcome, ANALYTICS_PROVIDER[method]);
    else establishWebSession(outcome, ANALYTICS_PROVIDER[method]);
  },
  report({ quiet, reason, cause }) {
    const command = `account_link_${reason}`;
    if (quiet) reportQuietError(quiet, command, describeError(cause), cause);
    else showErrorToast(command, describeError(cause), cause);
  },
};

export const identityClient = createIdentityClient({ gatewayUrl, port });

/** Prove the inbox, then link. A taken identity leaves the person signed in
 *  by email, often after the sign-in screen is gone, so it gets a toast. */
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
