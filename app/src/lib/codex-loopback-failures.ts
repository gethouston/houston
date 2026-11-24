/**
 * The failure and relay halves of the desktop Codex/OpenAI loopback sign-in
 * (`codex-loopback.ts`): relaying the browser callback's code to the engine,
 * and every way a relay or its setup can fail, bound to the real desktop
 * effects (toasts, reports, the device-code fallback).
 */

import { useUIStore } from "../stores/ui";
import { runCodexDeviceCodeFallback } from "./codex-device-code-fallback";
import { recoverFailedCodexRelay } from "./codex-relay-recovery";
import { genericErrorDescription, logAndReportError } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { providerName } from "./providers";
import { reportQuietError } from "./quiet-error-report";
import { tauriProvider } from "./tauri";

/** Reuse the existing "couldn't open sign-in" toast key with the provider's
 *  display name; falls back to the raw id for an unknown provider. */
function failCodexLogin(frontendProviderId: string, err: unknown): void {
  useUIStore.getState().addToast({
    title: i18n.t("providers:toast.signInFailed", {
      provider: providerName(frontendProviderId),
    }),
    description: genericErrorDescription("codex_loopback_login", err),
    variant: "error",
  });
}

/**
 * The engine dropped the login before the browser callback arrived (user
 * timing, not a bug): an expected-state toast explaining the browser tab
 * that is about to reopen, or asking the user to start over once the
 * auto-restart budget is spent. No Sentry error for this class.
 */
function expiredCodexLogin(
  frontendProviderId: string,
  restarting: boolean,
): void {
  const provider = providerName(frontendProviderId);
  showExpectedStateToast(
    i18n.t("providers:toast.signInExpiredTitle"),
    restarting
      ? i18n.t("providers:toast.signInExpiredRestarting", { provider })
      : i18n.t("providers:toast.signInExpiredRetry", { provider }),
  );
}

/**
 * The relay could not run on this machine (the fixed port 1455 is owned by
 * another process, or the browser refused to open): restart the SAME sign-in
 * as a device-code login instead of dead-ending into the connect timeout.
 * Cancel-first ordering and the no-toast-on-success policy live in
 * codex-device-code-fallback.ts; this only binds the real desktop effects.
 */
export function fallBackToDeviceCode(
  frontendProviderId: string,
  cause: unknown,
): Promise<void> {
  return runCodexDeviceCodeFallback(cause, {
    report: (err) => logAndReportError("codex_loopback_login", err),
    reportPortTaken: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[codex_loopback_login] ${message}`);
      reportQuietError(
        "codex_port_taken",
        "codex_loopback_login",
        message,
        err,
      );
    },
    cancelLogin: () => tauriProvider.cancelLogin(frontendProviderId),
    launchDeviceCodeLogin: () =>
      tauriProvider.launchLogin(frontendProviderId, {
        deviceAuth: true,
        toast: false,
      }),
    fail: (err) => failCodexLogin(frontendProviderId, err),
  });
}

/** Last auto-restart per provider (see `recoverFailedCodexRelay`'s cooldown). */
const relayRestartAt = new Map<string, number>();

/**
 * Relay the callback's query string to the engine. The submit runs with
 * `surface: false` because the failure that actually happens in the wild — the
 * engine dropped the login before the callback arrived, answering "no active
 * login" (HOU-1113, HOUSTON-APP-56B) — is an EXPECTED, recoverable state:
 * restart the same browser sign-in and OpenAI redirects the already-consented
 * app straight through. `recoverFailedCodexRelay` owns the one-restart budget
 * and every surface: the expected-state toast (breadcrumb only, no Sentry
 * error) for a lost login, the report + failure toast for anything else.
 */
export async function relayCodexCode(
  frontendProviderId: string,
  payload: string,
): Promise<void> {
  try {
    await tauriProvider.submitLoginCode(frontendProviderId, payload, {
      surface: false,
    });
  } catch (err) {
    await recoverFailedCodexRelay(err, {
      report: (cause) => logAndReportError("codex_loopback_relay", cause),
      // console.warn is mirrored to the frontend log and becomes a Sentry
      // breadcrumb on any later event — never an error event of its own.
      breadcrumb: (cause) =>
        console.warn(
          `[codex_loopback_relay] sign-in session expired on the engine: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        ),
      restartLogin: () =>
        tauriProvider.launchLogin(frontendProviderId, {
          deviceAuth: false,
          toast: false,
        }),
      fail: (cause) => failCodexLogin(frontendProviderId, cause),
      expired: (restarting) =>
        expiredCodexLogin(frontendProviderId, restarting),
      lastRestartAt: () => relayRestartAt.get(frontendProviderId) ?? null,
      noteRestart: () => relayRestartAt.set(frontendProviderId, Date.now()),
      now: () => Date.now(),
    });
  }
}
