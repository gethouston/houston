// The GCIP-BROKERED authorize round-trip (Apple only).
//
// Split from desktop-oauth.ts (the loopback+PKCE driver) because it shares none
// of that module's machinery: there is NO loopback listener here at all, so none
// of the port/attempt-id lifecycle applies. Both drivers do share the Tauri-free
// attempt registry in `oauth-attempt.ts`.

import { tauriSystem } from "../tauri";
import { listenDeepLink } from "./deep-link-listen.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { awaitLoopbackCallback } from "./oauth-attempt.ts";
import { parseCallbackQuery } from "./oauth-callback.ts";

/** A GCIP-brokered authorize round-trip's redemption input. */
export interface BrokeredAuthorizeResult {
  /** The full callback query the bridge deep-linked back (no leading `?`). */
  callbackQuery: string;
}

/**
 * Run one GCIP-BROKERED authorize round-trip (Apple). Unlike
 * {@link runLoopbackAuthorize} there is NO loopback listener: Apple rejects
 * `127.0.0.1` redirects, so the authorize URL minted by GCIP (`createAuthUri`)
 * redirects to the gateway's HTTPS bridge, which navigates the browser to a
 * real `houston://auth-callback?<query>` deep link the OS routes to the app —
 * the Rust shell re-emits it on the same `auth://deep-link` channel the
 * loopback flows use (see `apple-authorize.ts` for the pinned bridge
 * contract). The redemption input is the WHOLE callback query (fed to
 * `signInWithIdp` as the `requestUri`), not a PKCE code. CSRF: the `state`
 * GCIP embedded in its authorize URL is extracted by the caller and enforced
 * on the callback exactly like the PKCE flows. Resolves `null` on a benign
 * cancel (superseded / unmount / timeout).
 */
export async function runBrokeredDeepLinkAuthorize(
  mintAuthorizeUrl: () => Promise<{ url: string; expectedState: string }>,
  opts?: LoopbackAuthorizeOptions,
): Promise<BrokeredAuthorizeResult | null> {
  const minted = await mintAuthorizeUrl();
  const callbackQuery = await awaitLoopbackCallback({
    expectedState: minted.expectedState,
    authorizeUrl: minted.url,
    listen: listenDeepLink,
    openUrl: tauriSystem.openUrl,
    onBrowserOpened: opts?.onBrowserOpened,
    parsePayload: parseCallbackQuery,
    // No loopback port to free — the callback arrives as an OS deep link.
  });
  if (callbackQuery === null) return null; // benign cancel — no error, no session
  return { callbackQuery };
}
