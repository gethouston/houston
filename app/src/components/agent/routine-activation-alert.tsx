import type { TriggerStatusItem } from "@houston/engine-adapter";
import { Button, cn } from "@houston-ai/core";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activationAlertView } from "./routine-activation-alert-view";

interface Props {
  status: TriggerStatusItem | undefined;
  onReconnect: () => void;
}

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
