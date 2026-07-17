// Desktop loopback + PKCE authorize driver, shared by Google & Microsoft.
//
// One call = one sign-in attempt: mint PKCE + CSRF state, ask the Rust shell to
// bind a one-shot loopback listener (`osStartOauthLoopback` → redirect_uri),
// open the provider's authorize URL in the system browser, and await the
// `auth://deep-link` event the loopback emits with the callback query. The
// attempt lifecycle (own the listener + a ~300s timeout, supersede a previous
// pending attempt, cancel on unmount) lives in the Tauri-free `oauth-attempt.ts`
// so it stays unit-testable; this module wires the real Tauri primitives in.
//
// Starting a new authorize CANCELS any previous pending one (benign `null`); the
// timeout and `cancelPendingAuthorize()` also resolve `null`, so an abandoned
// browser tab never produces a minutes-later error toast. Only a genuine
// callback error rejects typed. The caller (google-authorize /
// microsoft-authorize) then redeems `code` + `codeVerifier` at the provider's
// token endpoint; a `null` here means "benign cancel — no session, no error".

import { listen } from "@tauri-apps/api/event";
import { osCancelOauthLoopback, osStartOauthLoopback } from "../os-bridge";
import { tauriSystem } from "../tauri";
import { IdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import {
  awaitLoopbackCallback,
  cancelPendingAuthorize,
  type DeepLinkListen,
} from "./oauth-attempt.ts";
import { parseCallbackQuery } from "./oauth-callback.ts";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./pkce.ts";

export { cancelPendingAuthorize };

/** The provider a loopback authorize is aimed at. */
export interface LoopbackAuthorizeParams {
  /** Provider authorize endpoint, e.g. Google's `.../o/oauth2/v2/auth`. */
  authorizeBase: string;
  /** OAuth client id for THIS provider's desktop app registration. */
  clientId: string;
  /** Space-delimited scope string (e.g. `openid email profile`). */
  scope: string;
  /** Extra authorize params (e.g. `{ prompt: "select_account" }`). */
  extraParams?: Record<string, string>;
}

/** Cross-cutting options threaded from the sign-in UI. */
export interface LoopbackAuthorizeOptions {
  /** Invoked once the system browser has opened (frees the sign-in buttons). */
  onBrowserOpened?: () => void;
}

export interface LoopbackAuthorizeResult {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/** The real `auth://deep-link` subscriber, adapted to the injected shape. */
const listenDeepLink: DeepLinkListen = (onPayload) =>
  listen<string>("auth://deep-link", (event) => onPayload(event.payload));

/**
 * Run one loopback+PKCE authorize round-trip. Resolves the redemption inputs, or
 * `null` when the attempt was benignly cancelled (superseded / unmount / timeout).
 */
export async function runLoopbackAuthorize(
  params: LoopbackAuthorizeParams,
  opts?: LoopbackAuthorizeOptions,
): Promise<LoopbackAuthorizeResult | null> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const state = generateState();

  let redirectUri: string;
  try {
    redirectUri = await osStartOauthLoopback();
  } catch (e) {
    // The loopback bind failed (all ports busy). We must NOT fall back to a
    // `houston://auth-callback` custom-scheme redirect_uri: Google/Microsoft
    // reject custom-scheme redirects on direct OAuth (guaranteed
    // redirect_uri_mismatch). Surface a typed error for the generic retry UI
    // instead of letting a raw invoke rejection propagate untyped.
    throw new IdentityError("unknown", {
      rawCode: "loopback_bind_failed",
      cause: e,
    });
  }

  const url = new URL(params.authorizeBase);
  const q = url.searchParams;
  q.set("client_id", params.clientId);
  q.set("redirect_uri", redirectUri);
  q.set("response_type", "code");
  q.set("scope", params.scope);
  q.set("code_challenge", codeChallenge);
  q.set("code_challenge_method", "S256");
  q.set("state", state);
  // Provider-specific authorize params (e.g. Google's `access_type=offline`,
  // Microsoft's `prompt=select_account`) come from the caller — nothing
  // Google-only rides on every provider's URL.
  for (const [k, v] of Object.entries(params.extraParams ?? {})) q.set(k, v);

  const code = await awaitLoopbackCallback({
    expectedState: state,
    authorizeUrl: url.toString(),
    listen: listenDeepLink,
    openUrl: tauriSystem.openUrl,
    onBrowserOpened: opts?.onBrowserOpened,
    // Free the native loopback port the moment the attempt is abandoned
    // (unmount / timeout). Best-effort: a failure just means the port frees at
    // Rust's 300s self-timeout, so we log rather than surface a toast.
    abandonLoopback: () => {
      void osCancelOauthLoopback().catch((e) =>
        identityLog(
          "warn",
          `failed to free loopback port: ${String(e)}`,
          "identity/desktop-oauth",
        ),
      );
    },
  });
  if (code === null) return null; // benign cancel — no error, no session
  return { code, redirectUri, codeVerifier };
}

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

/**
 * POST a form body to a provider token endpoint and return the parsed JSON.
 * Shared by the Google (confidential installed-app secret) and Microsoft
 * (public PKCE) exchanges. Every failure throws typed — nothing is swallowed.
 */
export async function postTokenForm(
  url: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (e) {
    throw new IdentityError("network", { cause: e });
  }
  if (!res.ok) {
    // Best-effort extraction of the provider's error token for diagnostics;
    // we throw regardless (never swallow the failure).
    let rawCode: string | undefined;
    try {
      const err = (await res.json()) as { error?: unknown };
      if (typeof err.error === "string") rawCode = err.error;
    } catch {
      rawCode = undefined;
    }
    throw new IdentityError("invalid_idp_response", {
      httpStatus: res.status,
      rawCode,
    });
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new IdentityError("malformed_response", {
      httpStatus: res.status,
      cause: e,
    });
  }
  if (typeof body !== "object" || body === null) {
    throw new IdentityError("malformed_response", { httpStatus: res.status });
  }
  return body as Record<string, unknown>;
}
