import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { motion, type Transition, useReducedMotion } from "framer-motion";
import { Loader2, RotateCw } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateStatus } from "../../lib/update-status";

export type UpdatePillStatus = Extract<
  UpdateStatus,
  { state: "downloaded" } | { state: "installing" } | { state: "error" }
>;

const ENTRANCE: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

export function UpdatePill({
  status,
  collapsed = false,
  onInstall,
  onRelaunch,
}: {
  status: UpdatePillStatus;
  collapsed?: boolean;
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

  const button = (
    <button
      type="button"
      onClick={relaunchOnly ? onRelaunch : onInstall}
      disabled={installing}
      aria-label={collapsed ? label : undefined}
      aria-describedby={hintId}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-action font-medium text-action-text text-sm transition-[transform,opacity] duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-gutter active:scale-[0.96] disabled:cursor-default disabled:opacity-80",
        collapsed ? "size-8 shrink-0" : "min-h-8 w-full px-2.5 py-1",
      )}
    >
      {installing ? (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <RotateCw aria-hidden="true" className="size-4 shrink-0" />
      )}
      {!collapsed && <span>{label}</span>}
      {!collapsed && !failed && !installing && (
        <span className="shrink-0 text-action-text/70 text-xs tabular-nums">
          v{status.info.version}
        </span>
      )}
    </button>
  );

  return (
    <motion.div
      role="status"
      aria-live="polite"
      data-testid="update-pill"
      className={cn("px-2 py-1", collapsed && "flex justify-center")}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </motion.div>
  );
}
