// Desktop Apple sign-in: GCIP authorize → gateway HTTPS bridge → `houston://`
// deep link.
//
// Apple rejects `http://127.0.0.1` redirect URIs outright (HTTP 403 at the
// authorize endpoint), and GCIP's `createAuthUri` passes the `continueUri` to
// the provider VERBATIM as `redirect_uri` — it does NOT broker through its own
// `/__/auth/handler`. So the desktop can never receive Apple's callback on the
// loopback listener. Instead the `continueUri` is the cloud gateway's Apple
// return bridge — the pinned contract the gateway implements:
//
//   POST {gateway}/v1/auth/apple/return
//     body: Apple's form_post params (`code`, `state`, and on first consent
//           `user`) — GCIP always forces `response_mode=form_post` for
//           apple.com, so the bridge's job is converting that POST into a GET
//           the app can receive.
//     response: navigate the browser to
//           `houston://auth-callback?<the same params re-encoded as a query>`
//           (a redirect or an interstitial page with a visible "Open Houston"
//           fallback link — some browsers block cross-scheme redirects on POST
//           responses). Stateless; the bridge never sees a secret.
//
// The OS routes `houston://auth-callback` to the app (deep-link plugin;
// single-instance forwards secondary argv on Windows/Linux), the Rust shell
// re-emits it on the same `auth://deep-link` channel the loopback flows use
// (`app/src-tauri/src/lib.rs`), and the attempt lifecycle + CSRF handling are
// IDENTICAL to PKCE: the `state` GCIP embedded in the authorize URL it minted
// is enforced on the callback; stale/foreign callbacks are ignored.
// `signInWithIdpSession` then redeems (`requestUri` = bridge URL + `?` +
// callback query, `sessionId`) — the Apple client secret lives only in the
// identity project's provider config, never on the client.
//
// Setup (human, one-time): the Apple provider enabled on the identity project
// (Services ID + team ID + key), the bridge URL registered as a return URL on
// the Services ID, and the gateway domain added to the project's authorized
// domains so `createAuthUri` accepts the `continueUri`.

import { gatewayUrl } from "../auth-gateway";
import { appleReturnUrl } from "./apple-return.ts";
import { identityConfig } from "./config.ts";
import {
  type LoopbackAuthorizeOptions,
  runBrokeredDeepLinkAuthorize,
} from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";
import { createAuthUri } from "./firebase-rest.ts";

/** Apple profile scopes; Apple returns name/email only on the FIRST consent. */
const APPLE_SCOPES = "name email";

export interface AppleAuthorizeResult {
  /** The full bridge callback URL (bridge URL + query) for `requestUri`. */
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
  const bridgeUrl = appleReturnUrl(gatewayUrl());
  let sessionId = "";
  const result = await runBrokeredDeepLinkAuthorize(async () => {
    const minted = await createAuthUri({
      apiKey: identityConfig.apiKey,
      providerId: "apple.com",
      continueUri: bridgeUrl,
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
    requestUri: `${bridgeUrl}?${result.callbackQuery}`,
    sessionId,
  };
}
