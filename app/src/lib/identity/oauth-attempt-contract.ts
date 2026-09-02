// The injected-seam contract and the two timeout policies for ONE desktop
// loopback authorize attempt. Split from `oauth-attempt.ts` (which owns the
// lifecycle itself) so both files stay inside the 200-line limit — the same
// split shape as session-storage-kv / session-load / session-store.
//
// Two clocks bound an attempt, and they mean different things:
//
//  * {@link BROWSER_OPEN_TIMEOUT_MS} bounds the PRE-browser leg — binding the
//    native loopback listener, minting PKCE, handing the URL to the system
//    browser. Nothing is visible to the user yet and the sign-in buttons are
//    still latched, so a hang here is a FAILURE: it rejects typed
//    (`browser_open_timeout`) so the buttons free and the screen says why.
//  * {@link CALLBACK_TIMEOUT_MS} bounds the wait AFTER the browser has the
//    flow. The user may legitimately take minutes, so expiry is a BENIGN cancel
//    (resolve `null`, no toast) — an abandoned tab must never raise an error.

import { IdentityError } from "./errors.ts";

/** How long to wait for the browser to return before abandoning (benign null). */
export const CALLBACK_TIMEOUT_MS = 300_000;

/** How long the pre-browser leg may take before the attempt fails typed. */
export const BROWSER_OPEN_TIMEOUT_MS = 15_000;

/** The typed failure a pre-browser hang raises. `stage` names what hung. */
export function browserOpenTimeout(stage: string): IdentityError {
  return new IdentityError("browser_open_timeout", { rawCode: stage });
}

/** Knobs for {@link withBrowserOpenDeadline}. */
export interface BrowserOpenDeadlineOptions<T> {
  /** Override the deadline (tests only; defaults to 15s). */
  ms?: number;
  /**
   * Release a resource that arrives AFTER we gave up on it.
   *
   * A pre-browser step can hand back something that must be cancelled, and it
   * cannot be cancelled while it runs: `start_oauth_loopback` only reveals its
   * `attemptId` when it returns, so at deadline time there is nothing to cancel
   * yet. Walking away would leave the listener it binds moments later holding
   * its port for the full 300s, where it supersedes the retry the user is now
   * watching. This callback fires with the late value so the caller can free it
   * immediately. It is NOT called when the step beat the deadline.
   */
  releaseIfLate?: (value: T) => void;
}

/**
 * Reject with {@link browserOpenTimeout} if `work` outlives its deadline. Used
 * for the pre-browser steps that are NOT owned by the attempt itself (the
 * `start_oauth_loopback` invoke), so one deadline covers the whole leg.
 *
 * `abandoned` is set synchronously inside the timer callback — before any
 * `work` continuation can observe it — so a late resolution is always routed to
 * `releaseIfLate` rather than silently resolving a promise nobody awaits.
 */
export function withBrowserOpenDeadline<T>(
  work: Promise<T>,
  stage: string,
  opts: BrowserOpenDeadlineOptions<T> = {},
): Promise<T> {
  let abandoned = false;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      abandoned = true;
      reject(browserOpenTimeout(stage));
    }, opts.ms ?? BROWSER_OPEN_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        if (abandoned) opts.releaseIfLate?.(value);
        else resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        // Already-rejected when the deadline won; `reject` is then a no-op and
        // the deadline's typed error stands.
        reject(e);
      },
    );
  });
}

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
  /**
   * Open the authorize URL in the system browser. Desktop-only flows (the
   * loopback listener is native), where the OS open never silently refuses;
   * the shared opener's popup-blocker verdict is irrelevant here and ignored.
   */
  openUrl: (url: string) => Promise<unknown>;
  /** Called once the browser has opened (frees the sign-in buttons). */
  onBrowserOpened?: () => void;
  /**
   * Free the native loopback port immediately (desktop injects
   * `osCancelOauthLoopback` bound to THIS attempt's id). Invoked on the
   * timeouts and on an EXTERNAL cancel (sign-in-screen unmount, sign-out) —
   * NOT on supersession, where the new attempt's `start_oauth_loopback` has
   * already superseded the old listener in Rust.
   */
  abandonLoopback?: () => void;
  /**
   * Turn the validated callback payload into the resolved value. Defaults to
   * `parseCallbackUrl` (the authorization `code`); the GCIP-brokered flows pass
   * `parseCallbackQuery` to get the whole query. Must enforce the CSRF state
   * identically (throw the state-mismatch `IdentityError` so a stale/foreign
   * callback keeps the attempt waiting).
   */
  parsePayload?: (payload: string, expectedState: string) => string;
  /** Override the abandonment timeout (tests only; defaults to 300s). */
  timeoutMs?: number;
  /** Override the pre-browser timeout (tests only; defaults to 15s). */
  browserOpenTimeoutMs?: number;
}
