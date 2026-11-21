import { useUIStore } from "../stores/ui";
import { runCodexDeviceCodeFallback } from "./codex-device-code-fallback";
import { recoverFailedCodexRelay } from "./codex-relay-recovery";
import { genericErrorDescription, logAndReportError } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { providerName } from "./providers";
import { reportQuietError } from "./quiet-error-report";
import { tauriProvider } from "./tauri";

function failCodexLogin(frontendProviderId: string, err: unknown): void {
  useUIStore.getState().addToast({
    title: i18n.t("providers:toast.signInFailed", {
      provider: providerName(frontendProviderId),
    }),
    description: genericErrorDescription("codex_loopback_login", err),
    variant: "error",
  });
}

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

const relayRestartAt = new Map<string, number>();

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
