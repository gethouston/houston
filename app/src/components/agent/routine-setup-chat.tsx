import type { Activity, Routine } from "@houston/engine-adapter";
import { ChatInput } from "@houston-ai/chat";
import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useBoardLabels } from "../board/use-board-labels";
import { RoutineActivationChip } from "./routine-activation-chip";
import { RoutineSetupChatBoard } from "./routine-setup-chat-board";
import { RoutineSetupChatClose } from "./routine-setup-chat-close";

interface Props {
  agent: Agent;
  activity: Activity | null;
  kind: "routine" | "draft" | "intake";
  routineName?: string;
  routine?: Routine;
  onClose: () => void;
  panelContainer: HTMLElement | null;
  intakeOverlay?: ReactNode;
  onIntakeSend?: (text: string) => void;
}

export function RoutineSetupChat({
  agent,
  activity,
  kind,
  routineName,
  routine,
  onClose,
  intakeOverlay,
  onIntakeSend,
  panelContainer,
}: Props) {
  const { t } = useTranslation("routines");
  const lock = useOrgWriteLock();
  const { composerLabels } = useBoardLabels();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      const editable =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (editable) {
        (el as HTMLElement).blur();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const closeButton = <RoutineSetupChatClose onClose={onClose} />;

  if (!activity) {
    const slimHeader = (title?: string) => (
      <div className="shrink-0 bg-pane px-4 py-3">
        <div className="max-w-3xl mx-auto w-full flex items-center gap-3">
          {title && (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {title}
            </span>
          )}
          {!title && <div className="min-w-0 flex-1" />}
          {closeButton}
        </div>
      </div>
    );

    const surface =
      kind === "routine" ? (
        <div className="flex h-full min-h-0 flex-col">
          {slimHeader()}
          <div className="min-h-0 flex-1 flex items-center justify-center gap-2 text-ink-muted">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">{t("chat.opening")}</span>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {slimHeader(t("chat.newRoutineTitle"))}
          <div className="min-h-0 flex-1" />
          {intakeOverlay && (
            <div className="shrink-0 px-4 pt-2">
              <div className="max-w-3xl mx-auto">{intakeOverlay}</div>
            </div>
          )}
          <ChatInput
            onSend={async (text) => onIntakeSend?.(text)}
            status={onIntakeSend ? "ready" : "submitted"}
            disabled={lock.locked}
            placeholder={
              lock.locked ? lock.reason : t("chat.intakePlaceholder")
            }
            labels={composerLabels}
            onNotice={(message) =>
              useUIStore.getState().addToast({ title: message })
            }
          />
        </div>
      );

    return panelContainer ? createPortal(surface, panelContainer) : null;
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;
  const missionLabel =
    kind === "draft"
      ? t("chat.newRoutineTitle")
      : t("chat.routineLabel", { name: routineName ?? "" });

  const panelActions =
    kind === "routine" && routine?.trigger ? (
      <RoutineActivationChip agentId={agent.id} routine={routine} />
    ) : undefined;

  return (
    <div className="hidden">
      <RoutineSetupChatBoard
        agent={agent}
        activity={activity}
        sessionKey={sessionKey}
        panelContainer={panelContainer}
        missionLabel={missionLabel}
        onPanelClose={onClose}
        panelActions={panelActions}
      />
    </div>
  );
}
