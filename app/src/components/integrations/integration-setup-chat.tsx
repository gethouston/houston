import type { Activity } from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { RoutineSetupChatBoard } from "../agent/routine-setup-chat-board";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";

interface Props {
  agent: Agent;
  activity: Activity | null;
  active: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function IntegrationSetupChat({
  agent,
  activity,
  active,
  onClose,
  onDone,
}: Props) {
  const { t } = useTranslation("integrations");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();

  useEffect(() => {
    if (!active) return;
    setPanelOpen(true);
    return () => setPanelOpen(false);
  }, [active, setPanelOpen]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      const editable =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (editable) {
        el.blur();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);

  if (!active || !panelContainer) return null;

  if (!activity) {
    return createPortal(
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 bg-pane px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {t("custom.setupChat.missionTitle")}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("custom.setupChat.close")}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ink-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">{t("custom.setupChat.opening")}</span>
        </div>
      </div>,
      panelContainer,
    );
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;

  const doneButton = (
    <Button variant="outline" size="sm" onClick={onDone}>
      {t("custom.setupChat.done")}
    </Button>
  );

  return (
    <div className="hidden">
      <RoutineSetupChatBoard
        agent={agent}
        activity={activity}
        sessionKey={sessionKey}
        panelContainer={panelContainer}
        onPanelClose={onClose}
        panelActions={doneButton}
      />
    </div>
  );
}
