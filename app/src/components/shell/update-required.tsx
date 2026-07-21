import {
  AlertCircle,
  DownloadCloud,
  ExternalLink,
  Loader2,
  RotateCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";
import type { UpdateStatus } from "../../hooks/use-update-checker";
import { osOpenUrl } from "../../lib/os-bridge";
import {
  currentAppVersion,
  type UpdateRequiredSignal,
} from "../../lib/update-floor";

/**
 * The hard-floor screen: the hosted gateway refused this build (app-update
 * floor), so every gateway call is failing with 426 and the app is unusable
 * until updated. A full-window, NON-dismissible overlay — unlike the
 * UpdateChecker card there is no X and no way back — that drives the same
 * updater flow the card does (install → progress → relaunch, via the shared
 * useUpdateChecker instance in UpdateChecker, which renders this).
 *
 * When the updater has nothing to install (dev build, feed unreachable) the
 * screen falls back to the gateway-provided `updateUrl`, and to a plain
 * re-check when even that is absent — never a dead end without a button.
 */
export function UpdateRequired({
  required,
  status,
  onInstall,
  onRelaunch,
}: {
  required: UpdateRequiredSignal;
  status: UpdateStatus;
  onInstall: () => void;
  onRelaunch: () => void;
}) {
  const { t } = useTranslation("shell");

  const downloading = status.state === "downloading";
  const ready = status.state === "ready";
  const error = status.state === "error";
  const relaunchOnly = ready || (error && status.phase === "relaunch");
  const progress = downloading ? status.progress : null;
  // `idle` here means the post-426 check found nothing to install (the hook
  // kicks one on the first signal) — the updater can't serve, so fall back.
  const updaterServes = status.state !== "idle";
  const fallbackUrl = !updaterServes ? required.updateUrl : null;

  const currentVersion = currentAppVersion();
  const message = (() => {
    if (downloading) {
      return progress === null
        ? t("updateChecker.downloading")
        : t("updateChecker.downloadingProgress", { progress });
    }
    if (ready) return t("updateChecker.ready");
    if (error && status.phase === "install")
      return t("updateChecker.errorInstall");
    if (error && status.phase === "relaunch")
      return t("updateChecker.errorRelaunch");
    return required.minVersion
      ? t("updateRequired.description", {
          currentVersion,
          minVersion: required.minVersion,
        })
      : t("updateRequired.descriptionNoVersion", { currentVersion });
  })();

  const onAction = fallbackUrl
    ? () => void osOpenUrl(fallbackUrl)
    : relaunchOnly
      ? onRelaunch
      : onInstall;
  const actionLabel = fallbackUrl
    ? t("updateRequired.downloadAction")
    : error
      ? t("updateChecker.retryAction")
      : relaunchOnly
        ? t("updateChecker.relaunchAction")
        : updaterServes
          ? t("updateChecker.primaryAction")
          : t("updateRequired.checkAction");

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("updateRequired.cardLabel")}
      aria-live={downloading ? "polite" : "assertive"}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/25 p-4"
    >
      {/* `bg-dialog`, not `bg-card`: the modal surface token is SOLID in both
          themes — the card token is glass and bleeds the page through. */}
      <div className="max-h-[calc(100vh-2rem)] w-[420px] max-w-full overflow-y-auto rounded-2xl border border-line/50 bg-dialog p-6 text-ink shadow-[0_4px_4px_rgba(0,0,0,0.04),0_4px_80px_8px_rgba(0,0,0,0.04),0_0_1px_rgba(0,0,0,0.62)] dark:shadow-[0_4px_4px_rgba(0,0,0,0.1),0_4px_80px_8px_rgba(0,0,0,0.2),0_0_1px_rgba(255,255,255,0.1)]">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-input ring-1 ring-line">
            <img
              src={houstonBlack}
              alt=""
              aria-hidden="true"
              className="houston-update-logo-light size-8 object-contain"
            />
            <img
              src={houstonWhite}
              alt=""
              aria-hidden="true"
              className="houston-update-logo-dark hidden size-8 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold leading-tight">
                {t("updateRequired.title")}
              </h2>
              {error && <AlertCircle className="size-4 shrink-0 text-danger" />}
            </div>
            <p className="mt-1 text-sm leading-snug text-ink-muted">
              {message}
            </p>
          </div>
        </div>

        {required.minVersion && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-chip-subtle p-3 text-xs font-medium">
            <span className="text-ink-muted">v{currentVersion}</span>
            <span aria-hidden="true" className="text-ink-muted">
              →
            </span>
            <span className="text-ink">v{required.minVersion}</span>
          </div>
        )}

        {downloading && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-chip-subtle">
            <div
              className={`h-full rounded-full bg-action transition-[width] duration-200 ${progress === null ? "animate-pulse" : ""}`}
              style={{ width: `${progress ?? 35}%` }}
            />
          </div>
        )}

        <button
          type="button"
          onClick={onAction}
          disabled={downloading}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-text transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : fallbackUrl ? (
            <ExternalLink className="size-4" />
          ) : relaunchOnly ? (
            <RotateCw className="size-4" />
          ) : (
            <DownloadCloud className="size-4" />
          )}
          {downloading ? t("updateChecker.installingAction") : actionLabel}
        </button>
      </div>
    </div>
  );
}
