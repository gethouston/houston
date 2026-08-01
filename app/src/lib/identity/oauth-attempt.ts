// Attempt registry + callback-await lifecycle for the desktop loopback OAuth flow.
//
// Extracted from desktop-oauth.ts so the supersede / cancel / timeout logic stays
// unit-testable: this module has NO Tauri imports — the deep-link listener and
// the system-browser open are injected. Exactly one attempt is "current" at a
// time. Three events end an attempt as a BENIGN cancel (resolve `null`, logged,
// never a toast): a newer attempt superseding it, `cancelPendingAuthorize()`
// (the sign-in screen unmounting, or a sign-out), and the ~300s callback timeout
// (an abandoned browser tab must never surface a minutes-later error).
//
// Two things REJECT typed: a genuine callback error (provider `error` param,
// unreadable payload, missing code), and a failed pre-browser leg — the browser
// never opening within the deadline, or the listener failing to install. That
// leg is NOT benign: the sign-in buttons stay latched until `onBrowserOpened`
// fires, so a silent hang there is the stuck-buttons bug. The seam types + both
// timeout policies live in `oauth-attempt-contract.ts`.

import { IdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import {
  type AwaitCallbackParams,
  BROWSER_OPEN_TIMEOUT_MS,
  browserOpenTimeout,
  CALLBACK_TIMEOUT_MS,
  type UnlistenFn,
} from "./oauth-attempt-contract.ts";
import { isCsrfStateMismatch, parseCallbackUrl } from "./oauth-callback.ts";

const LOG_CTX = "identity/desktop-oauth";

interface PendingAttempt {
  cancel: (reason: string, freePort: boolean) => void;
}

let current: PendingAttempt | null = null;

/**
 * Cancel the current pending authorize as a benign null (logged, no error). A
 * no-op when nothing is pending. Used on sign-in-screen unmount, on sign-out,
 * and internally when a new attempt supersedes an older one. `freePort` frees
 * the native loopback port too — default `true` for the external calls; the
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
 * benign cancel (superseded / `cancelPendingAuthorize` / callback timeout).
 * Rejects a typed `IdentityError` on a genuine callback error, on an inability
 * to install the listener / open the browser, and when the browser never opens
 * within the pre-browser deadline.
 */
export function awaitLoopbackCallback(
  params: AwaitCallbackParams,
): Promise<string | null> {
  // A new attempt supersedes any previous pending one (benign null). Don't free
  // the port here: this call runs right after the new attempt bound its own
  // listener, and Rust's `start_oauth_loopback` already superseded the old one.
  cancelPendingAuthorize("superseded by a new sign-in attempt", false);

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    let unlisten: UnlistenFn | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let openTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt: PendingAttempt;

    const clearOpenTimer = (): void => {
      if (openTimer) clearTimeout(openTimer);
      openTimer = null;
    };

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (current === attempt) current = null;
      if (timer) clearTimeout(timer);
      clearOpenTimer();
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

    // Pre-browser deadline: until `onBrowserOpened` fires the sign-in buttons
    // are latched and the user sees nothing at all, so a hang here must FAIL
    // loudly rather than sit for the full callback timeout (HOU stuck-buttons).
    openTimer = setTimeout(
      () =>
        finish(() => {
          identityLog(
            "error",
            "the system browser never opened; abandoning the sign-in attempt",
            LOG_CTX,
          );
          params.abandonLoopback?.();
          reject(browserOpenTimeout("open_url"));
        }),
      params.browserOpenTimeoutMs ?? BROWSER_OPEN_TIMEOUT_MS,
    );

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
        // The browser has the flow: the pre-browser deadline no longer applies,
        // only the (benign) callback timeout does.
        clearOpenTimer();
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
