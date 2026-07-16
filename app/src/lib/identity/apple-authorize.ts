// Desktop Apple sign-in: the GCIP-BROKERED loopback flow.
//
// Apple rejects `127.0.0.1` redirect URIs on direct OAuth, so the desktop can't
// run the Google/Microsoft loopback+PKCE shape against Apple itself. Instead
// GCIP is the broker: `createAuthUri` mints an Apple authorize URL whose
// redirect is GCIP's OWN handler (`https://<authDomain>/__/auth/handler`, the
// Services-ID-registered return URL that also serves the web popup), and the
// handler bounces the browser back to our loopback `continueUri` with the
// callback params. `signInWithIdpSession` then redeems the pair — the Apple
// client secret lives only in the identity project's provider config, never on
// the client.
//
// CSRF: GCIP embeds a `state` in the authorize URL it mints; we extract it and
// enforce it on the callback exactly like the PKCE flows (stale/foreign
// callbacks are ignored, the attempt keeps waiting).
//
// Setup (human, one-time): the Apple provider enabled on the identity project
// (Services ID + team ID + key), and `127.0.0.1` added to the project's
// authorized domains so the loopback `continueUri` is accepted.

import { identityConfig } from "./config.ts";
import {
  type LoopbackAuthorizeOptions,
  runBrokeredLoopbackAuthorize,
} from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";
import { createAuthUri } from "./firebase-rest.ts";

/** Apple profile scopes; Apple returns name/email only on the FIRST consent. */
const APPLE_SCOPES = "name email";

export interface AppleAuthorizeResult {
  /** The full loopback callback URL (continueUri + query) for `requestUri`. */
  requestUri: string;
  /** The `createAuthUri` session that pairs with the callback. */
  sessionId: string;
}

/**
 * Drive the desktop Apple flow up to the redeemable (`requestUri`, `sessionId`)
 * pair, or `null` when the authorize was benignly cancelled (superseded /
 * unmount / timeout).
 */
export async function authorizeAppleDesktop(
  opts?: LoopbackAuthorizeOptions,
): Promise<AppleAuthorizeResult | null> {
  let sessionId = "";
  const result = await runBrokeredLoopbackAuthorize(async (redirectUri) => {
    const minted = await createAuthUri({
      apiKey: identityConfig.apiKey,
      providerId: "apple.com",
      continueUri: redirectUri,
      oauthScope: APPLE_SCOPES,
    });
    sessionId = minted.sessionId;
    const state = new URL(minted.authUri).searchParams.get("state");
    if (!state) {
      // Without GCIP's state we cannot CSRF-match the callback — refuse to
      // open a browser we couldn't validate the return of.
      throw new IdentityError("malformed_response", {
        rawCode: "auth_uri_missing_state",
      });
    }
    return { url: minted.authUri, expectedState: state };
  }, opts);
  if (!result) return null; // benign cancel
  return {
    requestUri: `${result.redirectUri}?${result.callbackQuery}`,
    sessionId,
  };
}
