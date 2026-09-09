import { motion, type Transition, useReducedMotion } from "framer-motion";
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

/** Motion tokens: `easing.entrance` + `duration.fast` (200ms). One short
 *  ease-out as the pill lands, so the eye catches it; it never moves again. */
const ENTRANCE: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

/**
 * The "Restart to update" pill. A mid-session find downloads silently and
 * ends here: a small pill in the top corner of the window that names the
 * one action left, restarting into the new version, and does nothing until
 * the user clicks it. It never counts down, never blocks, never restarts on
 * its own. That is the whole point: a running turn, a draft in the composer
 * or a co-located engine mid-task is never interrupted by an update.
 *
 * It wears the solid `action` fill (dark ink on light, light ink on dark),
 * not a bordered dialog surface: the corner it holds is the window gutter,
 * and a gutter-coloured pill with a hairline was invisible in dark mode. It
 * is a plain button rather than the core `Button` primitive on purpose: the
 * canvas theme restyles the primitive's default variant into a translucent
 * frost pill in dark mode (`ui/core/src/canvas.css`), which on the gutter is
 * exactly the low-contrast look this replaces. The launch overlay's button
 * takes the same solid fill, so the two update surfaces match.
 *
 * It lives in the shell's top strip (`workspace-shell.tsx`), which grows to
 * fit it, so it holds the window's top corner on every screen without ever
 * covering the control that sits under that corner on the canvas. The hint
 * (which version, or what failed) is the button's description for assistive
 * tech; the visible pill stays short, as the corner has no room for a
 * sentence, but shows the version it will restart into so the label is not
 * the only thing that says "an update".
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
  const reduce = useReducedMotion() ?? false;
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
    <motion.div
      role="status"
      aria-live="polite"
      data-testid="update-pill"
      className="px-3 py-1"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE}
    >
      <button
        type="button"
        onClick={relaunchOnly ? onRelaunch : onInstall}
        disabled={installing}
        aria-describedby={hintId}
        className="inline-flex h-8 items-center gap-2 rounded-full bg-action pr-3.5 pl-2.5 font-medium text-action-text text-sm transition-[transform,opacity] duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-gutter active:scale-[0.96] disabled:cursor-default disabled:opacity-80"
      >
        {installing ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <RotateCw className="size-4" />
        )}
        {label}
        {!failed && !installing && (
          <span className="text-action-text/70 text-xs tabular-nums">
            v{status.info.version}
          </span>
        )}
      </button>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </motion.div>
  );
}
