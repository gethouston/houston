import { AlertCircle, DownloadCloud, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";
import type {
  InstallSource,
  UpdateStatus,
} from "../../hooks/use-update-checker";
import {
  FORCED_UPDATE_COUNTDOWN_SECONDS,
  type ForcedUpdateMode,
  tickCountdown,
} from "../../lib/update-force";
import { UpdateNotes } from "./update-notes";

/**
 * The forced-update dialog. Full-window and non-dismissible — updating is not
 * optional, only its timing is:
 *
 * - `launch` mode: the update was found the moment the app opened. The
 *   install is already running; this is a calm "upgrading Houston" overlay
 *   that ends in a relaunch.
 * - `countdown` mode: the update was found mid-session. A visible countdown
 *   installs it automatically at zero; the one button installs it now. The
 *   copy makes explicit that agents keep working and nothing is lost.
 */
export function UpdateForced({
  mode,
  status,
  notes,
  onInstall,
  onRelaunch,
}: {
  mode: ForcedUpdateMode;
  status: Exclude<UpdateStatus, { state: "idle" }>;
  notes: string | null;
  onInstall: (source: InstallSource) => void;
  onRelaunch: () => void;
}) {
  const { t } = useTranslation("shell");

  const downloading = status.state === "downloading";
  const ready = status.state === "ready";
  const error = status.state === "error";
  const relaunchOnly = ready || (error && status.phase === "relaunch");
  const progress = downloading ? status.progress : null;
  const info = status.info;

  // Mid-session countdown: ticks only while the update sits in "available";
  // once the download starts (either trigger) the timer is done. The ref
  // guards the expiry so re-renders can't fire the install twice.
  const counting = mode === "countdown" && status.state === "available";
  const [seconds, setSeconds] = useState(FORCED_UPDATE_COUNTDOWN_SECONDS);
  const expiredRef = useRef(false);
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setSeconds(tickCountdown), 1000);
    return () => clearInterval(id);
  }, [counting]);
  useEffect(() => {
    if (!counting || seconds > 0 || expiredRef.current) return;
    expiredRef.current = true;
    onInstall("countdown");
  }, [counting, seconds, onInstall]);

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
    return mode === "launch"
      ? t("updateForced.launchDescription", { version: info.version })
      : t("updateForced.countdownDescription", {
          count: seconds,
          version: info.version,
        });
  })();

  // In launch mode the install auto-starts, so outside of an error there is
  // nothing to click — the button just shows the busy state.
  const busy =
    downloading || (mode === "launch" && status.state === "available");
  const onAction = relaunchOnly ? onRelaunch : () => onInstall("user");
  const actionLabel = error
    ? t("updateChecker.retryAction")
    : relaunchOnly
      ? t("updateChecker.relaunchAction")
      : t("updateForced.updateNowAction");

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("updateForced.cardLabel")}
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
                {mode === "launch"
                  ? t("updateForced.launchTitle")
                  : t("updateForced.countdownTitle")}
              </h2>
              {error && <AlertCircle className="size-4 shrink-0 text-danger" />}
            </div>
            <p className="mt-1 text-sm leading-snug text-ink-muted">
              {message}
            </p>
          </div>
        </div>

        {!error && (
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            {t("updateForced.reassurance")}
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-chip-subtle p-3 text-xs font-medium">
          <span className="text-ink-muted">v{info.currentVersion}</span>
          <span aria-hidden="true" className="text-ink-muted">
            →
          </span>
          <span className="text-ink">v{info.version}</span>
        </div>

        {mode === "countdown" && (
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
        )}

        {busy && (
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
          disabled={busy}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-text transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : relaunchOnly ? (
            <RotateCw className="size-4" />
          ) : (
            <DownloadCloud className="size-4" />
          )}
          {busy ? t("updateChecker.installingAction") : actionLabel}
        </button>
      </div>
    </div>
  );
}
