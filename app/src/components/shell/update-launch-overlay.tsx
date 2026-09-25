import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
} from "@houston-ai/core";
import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";
import type { UpdateStatus } from "../../lib/update-status";

/**
 * An undismissable launch-time AlertDialog on the shared dialog frame.
 * The install runs with progress and ends in a relaunch.
 * Outside of an error there is nothing to click; a failed download
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
  const content = useRef<HTMLDivElement>(null);
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
    <AlertDialog
      open
      // Nothing dismisses this dialog: the install runs to a relaunch, and an
      // error's only way out is the retry in the footer.
      onOpenChange={() => undefined}
    >
      {/* `z-[70]`: above the lesson band (`z-[60]`, the spotlight veil
          over an open dialog), so a launch-time install landing mid-lesson
          still shows its recovery controls unveiled. The only layering rule
          a caller may add to the frame. */}
      <AlertDialogContent
        ref={content}
        tabIndex={-1}
        className="z-[70] max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        // Radix hands an alert dialog's focus to its Cancel; there is none
        // here, and the primary is disabled while the install runs, so the
        // surface itself takes focus or the user is left on the inert app.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          content.current?.focus({ preventScroll: true });
        }}
      >
        <AlertDialogHeader>
          <AlertDialogMedia>
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
          </AlertDialogMedia>
          <AlertDialogTitle className="flex items-center gap-2">
            {t("updateChecker.launchTitle")}
            {error && <AlertCircle className="size-4 shrink-0 text-danger" />}
          </AlertDialogTitle>
          {/* Pinned assertive: a live region whose politeness flips with its
              text is announced under the old setting, or not at all. The only
              change this text ever makes is the error. */}
          <AlertDialogDescription aria-live="assertive">
            {error
              ? message
              : t("updateChecker.launchDescription", {
                  version: info.version,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center justify-center gap-2 rounded-xl bg-chip-subtle p-3 text-xs font-medium">
          <span className="text-ink-muted">v{info.currentVersion}</span>
          <span aria-hidden="true" className="text-ink-muted">
            →
          </span>
          <span className="text-ink">v{info.version}</span>
        </div>

        {!error && (
          <div>
            <p
              aria-live="polite"
              className="text-xs leading-relaxed text-ink-muted"
            >
              {message}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip-subtle">
              <div
                className={`h-full rounded-full bg-action transition-[width] duration-200 ${progress === null ? "animate-pulse" : ""}`}
                style={{ width: `${progress ?? 35}%` }}
              />
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <Button
            onClick={relaunchOnly ? onRelaunch : onRetry}
            disabled={!error}
            className="w-full"
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
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
