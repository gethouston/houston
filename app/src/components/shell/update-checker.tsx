import { AlertCircle, DownloadCloud, Loader2, RotateCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUpdateChecker } from "../../hooks/use-update-checker";
import { normalizeUpdateNotes } from "../../lib/update-details";
import { UpdateNotes } from "./update-notes";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";

export function UpdateChecker() {
  const { t } = useTranslation("shell");
  const { status, installAndRelaunch, relaunchInstalledApp, dismiss } = useUpdateChecker();

  if (status.state === "idle") return null;

  const info = status.info;
  const notes = normalizeUpdateNotes(info.body);
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
    if (error && status.phase === "install") return t("updateChecker.errorInstall");
    if (error && status.phase === "relaunch") return t("updateChecker.errorRelaunch");
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
      className="fixed bottom-4 left-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-[0_16px_60px_rgba(0,0,0,0.16)]"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background ring-1 ring-border">
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
            {error && <AlertCircle className="size-4 shrink-0 text-destructive" />}
          </div>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{message}</p>
        </div>
        {!downloading && !ready && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("updateChecker.dismissAction")}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-muted p-3">
        <p className="text-xs font-medium text-foreground">
          {t("updateChecker.detailsHeading")}
        </p>
        <div className="mt-1 max-h-28 overflow-y-auto break-words text-xs leading-relaxed text-muted-foreground">
          {notes ? <UpdateNotes notes={notes} /> : <p>{t("updateChecker.noDetails")}</p>}
        </div>
      </div>

      {downloading && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full bg-primary transition-[width] duration-200 ${progress === null ? "animate-pulse" : ""}`}
            style={{ width: `${progress ?? 35}%` }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onAction}
        disabled={downloading}
        className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
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
