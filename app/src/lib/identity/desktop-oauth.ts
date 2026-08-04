// Desktop loopback + PKCE authorize driver (Google). Microsoft is GCIP-
// BROKERED instead (brokered-loopback.ts): neither Entra nor GCIP accepts a
// client-side Microsoft token exchange, so only Google runs this PKCE path.
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
// callback error rejects typed. The caller (google-authorize) then redeems
// `code` + `codeVerifier` at the provider's token endpoint; a `null` here
// means "benign cancel — no session, no error".

import {
  type OauthLoopbackStart,
  osCancelOauthLoopback,
  osStartOauthLoopback,
} from "../os-bridge";
import { tauriSystem } from "../tauri";
import { listenDeepLink } from "./deep-link-listen.ts";
import { IdentityError, isIdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import {
  awaitLoopbackCallback,
  cancelPendingAuthorize,
} from "./oauth-attempt.ts";
import { withBrowserOpenDeadline } from "./oauth-attempt-contract.ts";
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

const LOG_CTX = "identity/desktop-oauth";

/**
 * Free a native loopback listener by id. Scoped to ONE attempt, so a late cancel
 * can never free a newer attempt's port. Best-effort: a failure just means the
 * port frees at Rust's 300s self-timeout, so we log rather than toast.
 */
function releaseLoopback(attemptId: number, why: string): void {
  void osCancelOauthLoopback(attemptId).catch((e) =>
    identityLog(
      "warn",
      `failed to free loopback port (${why}): ${String(e)}`,
      LOG_CTX,
    ),
  );
}

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

  // The native listener is told the `state` up front so it can tell OUR
  // redirect from a stale tab replaying an older one (see oauth_loopback/):
  // a foreign callback no longer consumes the one-shot listener.
  let started: OauthLoopbackStart;
  try {
    started = await withBrowserOpenDeadline(
      osStartOauthLoopback(state),
      "loopback_bind",
      {
        // The invoke cannot be cancelled mid-flight (its attempt id does not
        // exist yet), so if the deadline wins we free the listener the moment it
        // finally appears. Left alone it would hold its port for Rust's full
        // 300s and supersede the retry the user is now watching.
        releaseIfLate: (late) => {
          if (late.status === "listening") {
            releaseLoopback(
              late.attemptId,
              "orphaned by the pre-browser deadline",
            );
          }
        },
      },
    );
  } catch (e) {
    // Already typed (the pre-browser deadline fired) — keep the specific code.
    if (isIdentityError(e)) throw e;
    // The loopback bind failed (all ports busy). We must NOT fall back to a
    // `houston://auth-callback` custom-scheme redirect_uri: Google rejects
    // custom-scheme redirects on direct OAuth (guaranteed
    // redirect_uri_mismatch). Surface a typed error for the generic retry UI
    // instead of letting a raw invoke rejection propagate untyped.
    throw new IdentityError("unknown", {
      rawCode: "loopback_bind_failed",
      cause: e,
    });
  }
  if (started.status === "superseded") {
    // A newer click already owns the loopback; that attempt is the one the user
    // is watching. Benign null, exactly like an in-app supersession.
    identityLog(
      "info",
      "loopback authorize superseded by a newer click before binding",
      LOG_CTX,
    );
    return null;
  }
  if (started.status === "portBusy") {
    // Only produced for an `exactPort` request, which this PKCE flow never
    // makes (it binds the first free candidate). Treat a stray one as a bind
    // failure rather than proceeding without a listener.
    throw new IdentityError("unknown", { rawCode: "loopback_bind_failed" });
  }
  const { redirectUri, attemptId } = started;

  const url = new URL(params.authorizeBase);
  const q = url.searchParams;
  q.set("client_id", params.clientId);
  q.set("redirect_uri", redirectUri);
  q.set("response_type", "code");
  q.set("scope", params.scope);
  q.set("code_challenge", codeChallenge);
  q.set("code_challenge_method", "S256");
  q.set("state", state);
  // Provider-specific authorize params (e.g. Google's `access_type=offline`)
  // come from the caller.
  for (const [k, v] of Object.entries(params.extraParams ?? {})) q.set(k, v);

  const code = await awaitLoopbackCallback({
    expectedState: state,
    authorizeUrl: url.toString(),
    listen: listenDeepLink,
    openUrl: tauriSystem.openUrl,
    onBrowserOpened: opts?.onBrowserOpened,
    // Free the native loopback port the moment the attempt is abandoned
    // (unmount / sign-out / timeout). Scoped to THIS attempt's id, so a late
    // cancel can never free a newer attempt's port. Best-effort: a failure just
    // means the port frees at Rust's 300s self-timeout, so we log rather than
    // surface a toast.
    abandonLoopback: () => releaseLoopback(attemptId, "attempt abandoned"),
  });
  if (code === null) return null; // benign cancel — no error, no session
  return { code, redirectUri, codeVerifier };
}

export { postTokenForm } from "./token-exchange.ts";
