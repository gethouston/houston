import { Loader2, RotateCw } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateStatus } from "../../lib/update-status";

/** The pill's inputs: a downloaded release waiting for its restart, the
 *  restart in progress, or a failed install / relaunch to retry. */
export type UpdatePillStatus = Extract<
  UpdateStatus,
  { state: "downloaded" } | { state: "installing" } | { state: "error" }
>;

/**
 * The "Restart to update" pill. A mid-session find downloads silently and
 * ends here: a small pill in the top corner of the window that names the
 * one action left, restarting into the new version, and does nothing until
 * the user clicks it. It never counts down, never blocks, never restarts on
 * its own. That is the whole point: a running turn, a draft in the composer
 * or a co-located engine mid-task is never interrupted by an update.
 *
 * Fixed to the viewport so it holds the same corner on every screen, above
 * the canvas but below dialogs. The hint (which version, or what failed) is
 * the button's description for assistive tech; the visible pill stays two
 * words, as the corner has no room for a sentence.
 */
export function UpdatePill({
  status,
  onInstall,
  onRelaunch,
}: {
  status: UpdatePillStatus;
  onInstall: () => void;
  onRelaunch: () => void;
}) {
  const { t } = useTranslation("shell");
  const hintId = useId();
  const installing = status.state === "installing";
  const failed = status.state === "error";
  const relaunchOnly = failed && status.phase === "relaunch";

  const label = installing
    ? t("updateChecker.restarting")
    : relaunchOnly
      ? t("updateChecker.relaunchAction")
      : failed
        ? t("updateChecker.retryUpdateAction")
        : t("updateChecker.restartAction");
  const hint = relaunchOnly
    ? t("updateChecker.errorRelaunch")
    : failed
      ? t("updateChecker.errorInstall")
      : t("updateChecker.restartHint", { version: status.info.version });

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-3 top-3 z-50"
    >
      <button
        type="button"
        onClick={relaunchOnly ? onRelaunch : onInstall}
        disabled={installing}
        aria-describedby={hintId}
        className="pointer-events-auto inline-flex h-8 items-center gap-2 rounded-full border border-line bg-dialog px-3 text-sm font-medium text-ink transition-[transform,opacity] duration-200 hover:bg-hover hover:text-hover-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.96] disabled:cursor-default disabled:opacity-70"
      >
        {installing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RotateCw className="size-4" />
        )}
        {label}
      </button>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </div>
  );
}
