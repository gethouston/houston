// Attempt registry + callback-await lifecycle for the desktop loopback OAuth flow.
//
// Extracted from desktop-oauth.ts so the supersede / cancel / timeout logic stays
// unit-testable: this module has NO Tauri imports — the deep-link listener and
// the system-browser open are injected. Exactly one attempt is "current" at a
// time. Three events end an attempt as a BENIGN cancel (resolve `null`, logged,
// never a toast): a newer attempt superseding it, `cancelPendingAuthorize()`
// (the sign-in screen unmounting), and the ~300s timeout (an abandoned browser
// tab must never surface a minutes-later error). Only a genuine callback error
// (provider `error` param, CSRF state mismatch, unreadable payload) — or a
// failure to open the browser / install the listener — REJECTS typed.

import { IdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import { isCsrfStateMismatch, parseCallbackUrl } from "./oauth-callback.ts";

const LOG_CTX = "identity/desktop-oauth";

/** How long to wait for the browser to return before abandoning (benign null). */
export const CALLBACK_TIMEOUT_MS = 300_000;

/** Unsubscribe handle returned by the injected deep-link listener. */
export type UnlistenFn = () => void;

/** Subscribe to the loopback callback payload; resolves to an unsubscribe fn. */
export type DeepLinkListen = (
  onPayload: (payload: string) => void,
) => Promise<UnlistenFn>;

export interface AwaitCallbackParams {
  /** The CSRF `state` the callback must echo back. */
  expectedState: string;
  /** The provider authorize URL to open in the system browser. */
  authorizeUrl: string;
  /** Subscribe to the `auth://deep-link` callback payload. */
  listen: DeepLinkListen;
  /** Open the authorize URL in the system browser. */
  openUrl: (url: string) => Promise<void>;
  /** Called once the browser has opened (frees the sign-in buttons). */
  onBrowserOpened?: () => void;
  /**
   * Free the native loopback port immediately (desktop injects
   * `osCancelOauthLoopback`). Invoked on the timeout and on an EXTERNAL cancel
   * (sign-in-screen unmount) — NOT on supersession, where the new attempt's
   * `start_oauth_loopback` has already superseded the old listener in Rust and a
   * second cancel could race and free the NEW listener's port.
   */
  abandonLoopback?: () => void;
  /**
   * Turn the validated callback payload into the resolved value. Defaults to
   * {@link parseCallbackUrl} (the authorization `code`); the GCIP-brokered
   * flows pass {@link parseCallbackQuery} to get the whole query. Must enforce
   * the CSRF state identically (throw the state-mismatch `IdentityError` so a
   * stale/foreign callback keeps the attempt waiting).
   */
  parsePayload?: (payload: string, expectedState: string) => string;
  /** Override the abandonment timeout (tests only; defaults to 300s). */
  timeoutMs?: number;
}

interface PendingAttempt {
  cancel: (reason: string, freePort: boolean) => void;
}

let current: PendingAttempt | null = null;

/**
 * Cancel the current pending authorize as a benign null (logged, no error). A
 * no-op when nothing is pending. Used on sign-in-screen unmount and internally
 * when a new attempt supersedes an older one. `freePort` frees the native
 * loopback port too — default `true` for the external (unmount) call; the
 * internal supersede path passes `false` (Rust already superseded the listener).
 */
export function cancelPendingAuthorize(
  reason = "cancelled by caller",
  freePort = true,
): void {
  current?.cancel(reason, freePort);
}

/**
 * Await one loopback callback. Resolves the authorization `code`, or `null` on a
 * benign cancel (superseded / `cancelPendingAuthorize` / timeout). Rejects a
 * typed `IdentityError` only on a genuine callback error or an inability to open
 * the browser / install the listener.
 */
export function awaitLoopbackCallback(
  params: AwaitCallbackParams,
): Promise<string | null> {
  // A new attempt supersedes any previous pending one (benign null). Don't free
  // the port here: this call runs right before the new attempt binds its own
  // listener, and Rust's `start_oauth_loopback` already superseded the old one.
  cancelPendingAuthorize("superseded by a new sign-in attempt", false);

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    let unlisten: UnlistenFn | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt: PendingAttempt;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (current === attempt) current = null;
      if (timer) clearTimeout(timer);
      if (unlisten) unlisten();
      fn();
    };

    attempt = {
      cancel: (reason, freePort) =>
        finish(() => {
          identityLog(
            "info",
            `loopback authorize cancelled: ${reason}`,
            LOG_CTX,
          );
          if (freePort) params.abandonLoopback?.();
          resolve(null);
        }),
    };
    current = attempt;

    timer = setTimeout(
      () =>
        finish(() => {
          identityLog(
            "warn",
            "loopback authorize timed out; abandoning the attempt (benign)",
            LOG_CTX,
          );
          params.abandonLoopback?.();
          resolve(null);
        }),
      params.timeoutMs ?? CALLBACK_TIMEOUT_MS,
    );

    params
      .listen((payload) => {
        try {
          const parse = params.parsePayload ?? parseCallbackUrl;
          const value = parse(payload, params.expectedState);
          finish(() => resolve(value));
        } catch (e) {
          // A callback whose CSRF `state` doesn't match THIS attempt is a
          // stale/foreign one (every attempt shares the single `auth://deep-link`
          // channel, and a rebound loopback port can deliver an abandoned tab's
          // callback here). Ignore it and KEEP WAITING — a stale/forged payload
          // must never settle (kill) the legitimate pending attempt. CSRF is
          // still enforced: the wrong-state code is never accepted, and the ~300s
          // timeout still bounds the wait.
          if (isCsrfStateMismatch(e)) {
            identityLog(
              "warn",
              "ignoring a loopback callback with a mismatched CSRF state (stale/foreign attempt); still waiting",
              LOG_CTX,
            );
            return;
          }
          finish(() =>
            reject(
              e instanceof IdentityError
                ? e
                : new IdentityError("invalid_idp_response", { cause: e }),
            ),
          );
        }
      })
      .then((fn) => {
        // The listener may resolve AFTER the attempt already settled (timeout /
        // cancel) — tear it down immediately in that case so it never leaks.
        if (settled) fn();
        else unlisten = fn;
      })
      .catch((e) =>
        finish(() =>
          reject(
            new IdentityError("unknown", {
              rawCode: "listen_failed",
              cause: e,
            }),
          ),
        ),
      );

    params
      .openUrl(params.authorizeUrl)
      .then(() => {
        if (!settled) params.onBrowserOpened?.();
      })
      .catch((e) =>
        finish(() =>
          reject(
            new IdentityError("network", {
              rawCode: "open_url_failed",
              cause: e,
            }),
          ),
        ),
      );
  });
}
