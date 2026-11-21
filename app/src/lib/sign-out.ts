import { nativeShell } from "../../../packages/web/src/shims/native-shell";
import { cancelAllConnectFlows } from "../stores/connect-flow";
import { identityClient } from "./account-link";
import { analytics } from "./analytics";
import { emitAuthError } from "./auth-error-bus";
import { logAndReportError } from "./error-report";
import { purgeAccountLocalState } from "./houston-local-state";
import { clearSession, stopProactiveRefresh } from "./identity";
import { cancelPendingAuthorize } from "./identity/desktop-oauth";
import { resetForIdentityChange } from "./identity-reset";
import { logger } from "./logger";
import { osIsTauri } from "./os-bridge";
import { osIsNativeMobile } from "./os-bridge/platform";
import { clearPersistedLocalData } from "./query-persist";
import { cacheSession, forgetActiveIdentity } from "./session-cache";
import { signOutFailure } from "./sign-out-failure";
import { tauriPush } from "./tauri";

const loadWebIdentity = () => import("@houston/web-identity");

async function boundedPushCleanup(
  run: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Push sign-out cleanup timed out after 3 seconds"));
        }, 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function signOut(): Promise<void> {
  if (osIsNativeMobile() && nativeShell()?.push.available) {
    try {
      await boundedPushCleanup(async (signal) => {
        const id = await tauriPush.deviceId();
        await tauriPush.unregister(id, signal);
      });
    } catch (error) {
      logAndReportError("push_sign_out_unregister", error);
    }
    try {
      await boundedPushCleanup(async () => {
        await nativeShell()?.push.deleteToken();
      });
    } catch (error) {
      logAndReportError("push_sign_out_delete_token", error);
    }
  }
  cancelAllConnectFlows();
  cancelPendingAuthorize("signing out");
  identityClient.abandonAccountLink();

  let sessionClearFailure: unknown;
  let localDataFailure: unknown;
  try {
    if (osIsTauri()) {
      stopProactiveRefresh();
      await clearSession();
    } else {
      const web = await loadWebIdentity();
      await web.webSignOut();
    }
  } catch (e) {
    sessionClearFailure = e;
    logger.error(
      `[auth] sign-out could not clear the stored session; it may survive this quit: ${e}`,
    );
  }
  try {
    await clearPersistedLocalData();
    purgeAccountLocalState(window.localStorage);
  } catch (e) {
    localDataFailure = e;
    logger.error(`[auth] sign-out could not wipe persisted local data: ${e}`);
  }
  analytics.track("user_signed_out");
  analytics.reset();
  resetForIdentityChange();
  forgetActiveIdentity();
  cacheSession(null);

  const failure = signOutFailure(sessionClearFailure, localDataFailure);
  if (failure) {
    emitAuthError(failure.code);
    throw failure;
  }
}
