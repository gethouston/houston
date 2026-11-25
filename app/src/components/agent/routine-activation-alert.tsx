import { Button, cn } from "@houston-ai/core";
import type { TriggerStatusItem } from "@houston/engine-adapter";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activationAlertView } from "./routine-activation-alert-view";

interface Props {
  status: TriggerStatusItem | undefined;
  onReconnect: () => void;
}

/**
 * The routine screen's alert block for a trigger binding that needs attention:
 * the human reason, and a one-click Reconnect only when reconnecting is what
 * fixes it (`activationAlertView`).
 */
export function RoutineActivationAlert({ status, onReconnect }: Props) {
  const { t } = useTranslation("routines");
  const view = activationAlertView(status);
  const detail =
    view.detail?.kind === "hint"
      ? t(view.detail.key)
      : view.detail?.kind === "server"
        ? view.detail.text
        : undefined;
  return (
    <div className="flex flex-col items-end gap-0.5 max-w-[15rem]">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
        <AlertTriangle className="size-3.5 shrink-0" />
        {t(view.labelKey)}
      </span>
      {detail && (
        <p
          className={cn(
            "text-xs text-ink-muted text-right",
            // Authored copy carries the remedy and must read whole; the
            // host's own detail can run long.
            view.detail?.kind === "server" && "line-clamp-2",
          )}
        >
          {detail}
        </p>
      )}
      {view.showReconnect && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReconnect}
          className="-mr-2"
        >
          {t("trigger.reconnect")}
        </Button>
      )}
    </div>
  );
}
