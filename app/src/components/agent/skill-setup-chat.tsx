import type { Activity } from "@houston/engine-adapter";
import { Button, Spinner } from "@houston-ai/core";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { skillChatTurnContext } from "../../lib/skill-chat-prompts";
import type { Agent } from "../../lib/types";
import { useIsActiveView } from "../shell/keep-alive-views";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { RoutineSetupChatBoard } from "./routine-setup-chat-board";

interface Props {
  agent: Agent;
  activity: Activity | null;
  kind: "skill" | "draft";
  skillName?: string;
  skillSlug?: string;
  onClose: () => void;
  onEditManually?: () => void;
  onDiscardDraft?: () => void;
}

export function SkillSetupChat({
  agent,
  activity,
  kind,
  skillName,
  skillSlug,
  onClose,
  onEditManually,
  onDiscardDraft,
}: Props) {
  const { t } = useTranslation("skills");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();

  const isActive = useIsActiveView();
  useEffect(() => {
    setPanelOpen(isActive);
    return () => setPanelOpen(false);
  }, [setPanelOpen, isActive]);

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
        el.blur();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const missionLabel =
    kind === "draft"
      ? t("setupChat.missionTitle")
      : t("setupChat.skillLabel", { name: skillName ?? "" });

  if (!activity) {
    const surface = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 bg-pane px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {missionLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("setupChat.close")}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ink-muted">
          <Spinner className="size-4" />
          <span className="text-sm">{t("setupChat.opening")}</span>
        </div>
      </div>
    );
    return panelContainer && isActive
      ? createPortal(surface, panelContainer)
      : null;
  }

  const sessionKey = activity.session_key ?? `activity-${activity.id}`;

  const headerActions =
    kind === "skill" && onEditManually ? (
      <Button variant="outline" size="sm" onClick={onEditManually}>
        {t("setupChat.editManually")}
      </Button>
    ) : kind === "draft" && onDiscardDraft ? (
      <Button variant="outline" size="sm" onClick={onDiscardDraft}>
        {t("setupChat.discardDraft")}
      </Button>
    ) : undefined;

  return (
    <div className="hidden">
      <RoutineSetupChatBoard
        agent={agent}
        activity={activity}
        sessionKey={sessionKey}
        panelContainer={isActive ? panelContainer : null}
        missionLabel={missionLabel}
        panelActions={headerActions}
        onPanelClose={onClose}
        disableComposerAutoFocus={kind === "skill"}
        promptContext={
          kind === "skill" && skillSlug
            ? skillChatTurnContext({
                slug: skillSlug,
                displayName: skillName ?? "",
              })
            : undefined
        }
      />
    </div>
  );
}
