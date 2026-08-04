// Desktop Microsoft sign-in: GCIP-BROKERED authorize over the loopback.
//
// WHY brokered and not loopback+PKCE like Google (HOU-1112): Entra refuses a
// public-client code redemption made from a webview (the fetch carries an
// `Origin` header, and AADSTS90023 restricts cross-origin redemption to SPA
// registrations), and GCIP refuses Microsoft tokens it did not obtain itself
// (`INVALID_CREDENTIAL_OR_PROVIDER_ID`) — so a client-side token exchange can
// never produce a Microsoft session. Instead GCIP mints the authorize URL
// (`createAuthUri`, carrying its own CSRF `state`), the loopback catches the
// redirect, and GCIP redeems the code server-side with the client secret from
// the identity project's provider config (`signInWithIdpSession` in
// desktop-signin.ts). No Microsoft client id or secret ships in this app.
//
// Setup (human, one-time): the Azure app's **Web** platform must list every
// candidate loopback redirect as `http://localhost:<port>/auth/callback`
// (Entra's Web platform only allows plain http for `localhost`), and the
// microsoft.com provider on the identity project holds the same app's client
// id + secret (cloud terraform `identity.tf`).

import { osCancelOauthLoopback, osStartOauthLoopback } from "../os-bridge";
import { tauriSystem } from "../tauri";
import {
  type BrokeredLoopbackResult,
  runBrokeredLoopbackAuthorize,
} from "./brokered-loopback.ts";
import { identityConfig } from "./config.ts";
import { listenDeepLink } from "./deep-link-listen.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { createAuthUri } from "./firebase-rest.ts";
import { identityLog } from "./log.ts";

const LOG_CTX = "identity/microsoft-authorize";

/**
 * Drive the desktop Microsoft flow up to the redeemable (`requestUri`,
 * `sessionId`) pair, or `null` when the authorize was benignly cancelled
 * (superseded / unmount / timeout).
 */
export function authorizeMicrosoftDesktop(
  opts?: LoopbackAuthorizeOptions,
): Promise<BrokeredLoopbackResult | null> {
  return runBrokeredLoopbackAuthorize(
    {
      mint: (continueUri) =>
        createAuthUri({
          apiKey: identityConfig.apiKey,
          providerId: "microsoft.com",
          continueUri,
        }),
      startLoopback: osStartOauthLoopback,
      releaseLoopback: (attemptId, why) => {
        // Best-effort: a failure just means the port frees at the native 300s
        // self-timeout, so log rather than toast (same policy as desktop-oauth).
        void osCancelOauthLoopback(attemptId).catch((e) =>
          identityLog(
            "warn",
            `failed to free loopback port (${why}): ${String(e)}`,
            LOG_CTX,
          ),
        );
      },
      listen: listenDeepLink,
      openUrl: tauriSystem.openUrl,
    },
    opts,
  );
}
