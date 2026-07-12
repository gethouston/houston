import { AlertCircle, DownloadCloud, Loader2, RotateCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";
import { useUpdateChecker } from "../../hooks/use-update-checker";
import { selectUpdateNotes } from "../../lib/update-details";
import { UpdateNotes } from "./update-notes";

export function UpdateChecker() {
  const { t, i18n } = useTranslation("shell");
  const { status, installAndRelaunch, relaunchInstalledApp, dismiss } =
    useUpdateChecker();

  if (status.state === "idle") return null;

  const info = status.info;
  // The release ships en/es/pt notes in one updater string; pick the one for
  // the active UI language (which already honors the workspace locale override).
  const notes = selectUpdateNotes(info.body, i18n.language);
  const downloading = status.state === "downloading";
  const ready = status.state === "ready";
  const error = status.state === "error";
  const relaunchOnly = ready || (error && status.phase === "relaunch");
  const progress = downloading ? status.progress : null;

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
    return t("updateChecker.availableDescription", {
      currentVersion: info.currentVersion,
      version: info.version,
    });
  })();

  const onAction = relaunchOnly ? relaunchInstalledApp : installAndRelaunch;
  const actionLabel = error
    ? t("updateChecker.retryAction")
    : relaunchOnly
      ? t("updateChecker.relaunchAction")
      : t("updateChecker.primaryAction");

  return (
    <aside
      aria-label={t("updateChecker.cardLabel")}
      aria-live={downloading ? "polite" : "assertive"}
      className="fixed bottom-4 left-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-4 text-card-text shadow-[0_16px_60px_rgba(0,0,0,0.16)]"
    >
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
              {t("updateChecker.title")}
            </h2>
            {error && <AlertCircle className="size-4 shrink-0 text-danger" />}
          </div>
          <p className="mt-1 text-sm leading-snug text-ink-muted">{message}</p>
        </div>
        {!downloading && !ready && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("updateChecker.dismissAction")}
            className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-chip-subtle p-3">
        <p className="text-xs font-medium text-ink">
          {t("updateChecker.detailsHeading")}
        </p>
        <div className="mt-1 max-h-28 overflow-y-auto break-words text-xs leading-relaxed text-ink-muted">
          {notes ? (
            <UpdateNotes notes={notes} />
          ) : (
            <p>{t("updateChecker.noDetails")}</p>
          )}
        </div>
      </div>

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
        ) : relaunchOnly ? (
          <RotateCw className="size-4" />
        ) : (
          <DownloadCloud className="size-4" />
        )}
        {downloading ? t("updateChecker.installingAction") : actionLabel}
      </button>
    </aside>
  );
}
