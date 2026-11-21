import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../lib/error-report";
import { reportRejection } from "../lib/report-rejection";
import { tauriActivity, tauriChat } from "../lib/tauri";
import {
  DEFAULT_TURN_MODE,
  type PickedTurnMode,
  pickSettled,
  resolveConversationTurnMode,
  type TurnMode,
} from "../lib/turn-mode";
import { useUIStore } from "../stores/ui";

interface ConversationTurnModeInput {
  path: string | null;
  sessionKey: string | null;
  card: { id: string; mode?: unknown } | null;
  initialTurnMode?: TurnMode;
  turnRunning: boolean;
}

export function useConversationTurnMode({
  path,
  sessionKey,
  card,
  initialTurnMode,
  turnRunning,
}: ConversationTurnModeInput) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const fallback = initialTurnMode ?? DEFAULT_TURN_MODE;
  const [localMode, setLocalMode] = useState<TurnMode>(fallback);
  const [picked, setPicked] = useState<PickedTurnMode | null>(null);

  useEffect(() => {
    if (!path) setLocalMode(fallback);
  }, [path, fallback]);
  const previousSessionKey = useRef(sessionKey);
  useEffect(() => {
    const previous = previousSessionKey.current;
    previousSessionKey.current = sessionKey;
    if (previous && !sessionKey) setLocalMode(fallback);
  }, [sessionKey, fallback]);
  useEffect(() => {
    if (picked && pickSettled(picked, card)) setPicked(null);
  }, [card, picked]);

  const turnMode = resolveConversationTurnMode({
    card,
    picked,
    localMode,
    fallback,
  });

  const selectTurnMode = useCallback(
    (mode: TurnMode) => {
      if (card && path) {
        setPicked({ cardId: card.id, mode, from: card.mode });
        reportRejection(
          tauriActivity.setMode(path, card.id, mode),
          "chat.keep-conversation-mode",
          logAndReportError,
        );
      } else {
        setLocalMode(mode);
      }
      if (!turnRunning || !path || !sessionKey || mode === turnMode) return;
      const labels: Record<TurnMode, string> = {
        execute: t("modeSelector.askFirst"),
        plan: t("modeSelector.planner"),
        auto: t("modeSelector.autopilot"),
      };
      tauriChat.setLiveTurnMode(path, sessionKey, mode).catch((err) => {
        logAndReportError("chat.set-live-turn-mode", err);
        addToast({
          title: t("modeSelector.liveApplyFailedTitle", {
            mode: labels[mode],
          }),
          description: t("modeSelector.liveApplyFailedBody"),
          variant: "error",
        });
      });
    },
    [card, path, sessionKey, turnRunning, turnMode, t, addToast],
  );

  return { turnMode, selectTurnMode };
}
