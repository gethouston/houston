// The app's binding of the SDK identity module: the platform port the
// account-exists flow drives, and the calls the sign-in screen makes. The
// flow's state lives in the SDK, so a link finishes even when the sign-in
// screen unmounts (web mirrors the email-code session into the app as soon as
// Firebase signs it in).

import { createIdentityClient } from "@houston/engine-adapter";
import type {
  AccountLinkPort,
  PendingLink,
  VerifyLinkOutcome,
} from "@houston/sdk/identity";
import { gatewayUrl } from "./auth-gateway";
import { logAndReportError } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { IdentityError, type Session } from "./identity";
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

const port: AccountLinkPort<Session> = {
  async signInWithCustomToken(customToken) {
    if (osIsTauri())
      return (await customTokenDesktopSession(customToken)).session;
    const outcome = await (await webIdentity()).webSignInWithCustomToken(
      customToken,
    );
    if (!outcome) throw new IdentityError("malformed_response");
    return outcome.session;
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
  async signOutProvisional() {
    // Desktop never stored or published the email-code session. Web mirrored
    // it into the app the moment Firebase signed in, so it gets the full
    // sign-out that wipes what loaded under it.
    if (!osIsTauri()) await signOut();
  },
  async establish(session, method) {
    const outcome = { session, isNewUser: false };
    if (osIsTauri())
      await establishDesktopSession(outcome, ANALYTICS_PROVIDER[method]);
    else establishWebSession(outcome, ANALYTICS_PROVIDER[method]);
  },
  report({ severity, reason, cause }) {
    if (severity === "quiet")
      reportQuietError("link_identity_taken", "account_link", reason, cause);
    else logAndReportError(`account_link_${reason}`, cause);
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
