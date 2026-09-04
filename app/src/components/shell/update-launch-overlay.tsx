import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";
import type { UpdateStatus } from "../../lib/update-status";

/**
 * The launch-time update overlay. The launch check found a release before
 * the user started anything, so the install is already running: this is a
 * calm full-window "upgrading Houston" card with progress that ends in a
 * relaunch. Outside of an error there is nothing to click; a failed download
 * or install shows the error copy with a manual retry, and a failed relaunch
 * offers the relaunch again. Mid-session finds never come here (they end in
 * the restart pill, `update-pill.tsx`).
 */
export function UpdateLaunchOverlay({
  status,
  onRetry,
  onRelaunch,
}: {
  status: Exclude<UpdateStatus, { state: "idle" } | { state: "available" }>;
  onRetry: () => void;
  onRelaunch: () => void;
}) {
  const { t } = useTranslation("shell");
  const info = status.info;
  const error = status.state === "error";
  const relaunchOnly = error && status.phase === "relaunch";
  const progress = status.state === "downloading" ? status.progress : null;

  const message = (() => {
    if (status.state === "downloading") {
      return progress === null
        ? t("updateChecker.downloading")
        : t("updateChecker.downloadingProgress", { progress });
    }
    if (status.state === "downloaded" || status.state === "installing") {
      return t("updateChecker.installing");
    }
    if (relaunchOnly) return t("updateChecker.errorRelaunch");
    return t("updateChecker.errorInstall");
  })();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("updateChecker.launchLabel")}
      aria-live={error ? "assertive" : "polite"}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/25 p-4"
    >
      {/* `bg-dialog`, not `bg-card`: the modal surface token is SOLID in both
          themes — the card token is glass and bleeds the page through. */}
      <div className="max-h-[calc(100dvh-2rem)] w-[420px] max-w-full overflow-y-auto rounded-2xl border border-line/50 bg-dialog p-6 text-ink shadow-[0_4px_4px_rgba(0,0,0,0.04),0_4px_80px_8px_rgba(0,0,0,0.04),0_0_1px_rgba(0,0,0,0.62)] dark:shadow-[0_4px_4px_rgba(0,0,0,0.1),0_4px_80px_8px_rgba(0,0,0,0.2),0_0_1px_rgba(255,255,255,0.1)]">
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
                {t("updateChecker.launchTitle")}
              </h2>
              {error && <AlertCircle className="size-4 shrink-0 text-danger" />}
            </div>
            <p className="mt-1 text-sm leading-snug text-ink-muted">
              {error
                ? message
                : t("updateChecker.launchDescription", {
                    version: info.version,
                  })}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-chip-subtle p-3 text-xs font-medium">
          <span className="text-ink-muted">v{info.currentVersion}</span>
          <span aria-hidden="true" className="text-ink-muted">
            →
          </span>
          <span className="text-ink">v{info.version}</span>
        </div>

        {!error && (
          <>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              {message}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip-subtle">
              <div
                className={`h-full rounded-full bg-action transition-[width] duration-200 ${progress === null ? "animate-pulse" : ""}`}
                style={{ width: `${progress ?? 35}%` }}
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={relaunchOnly ? onRelaunch : onRetry}
          disabled={!error}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-text transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
        >
          {error ? (
            <RotateCw className="size-4" />
          ) : (
            <Loader2 className="size-4 animate-spin" />
          )}
          {relaunchOnly
            ? t("updateChecker.relaunchAction")
            : error
              ? t("updateChecker.retryAction")
              : t("updateChecker.installing")}
        </button>
      </div>
    </div>
  );
}
