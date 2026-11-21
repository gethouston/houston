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

export function cancelPendingAuthorize(
  reason = "cancelled by caller",
  freePort = true,
): void {
  current?.cancel(reason, freePort);
}

export function awaitLoopbackCallback(
  params: AwaitCallbackParams,
): Promise<string | null> {
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
