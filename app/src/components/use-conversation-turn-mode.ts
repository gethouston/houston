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
  /** The mission card backing the open conversation, when one does. */
  card: { id: string; mode?: unknown } | null;
  /** The mode a fresh composer (and a card with none) opens on. */
  initialTurnMode?: TurnMode;
  turnRunning: boolean;
}

/**
 * The composer's Mode pill for one conversation (HOU-205). A mission keeps its
 * mode on its card, so leaving the chat, a restart or another surface all read
 * the mode the person picked; a fresh composer, or a chat no card backs, holds
 * the pick in session and starts over on Ask first.
 */
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
  // Leaving a chat for a fresh composer starts the next mission on Ask first.
  const previousSessionKey = useRef(sessionKey);
  useEffect(() => {
    const previous = previousSessionKey.current;
    previousSessionKey.current = sessionKey;
    if (previous && !sessionKey) setLocalMode(fallback);
  }, [sessionKey, fallback]);
  // The pick stops being echoed once the card reads back any write.
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
        // A failed write keeps the pick for this session: every send still
        // pins it, only the next visit would not see it.
        reportRejection(
          tauriActivity.setMode(path, card.id, mode),
          "chat.keep-conversation-mode",
          logAndReportError,
        );
      } else {
        setLocalMode(mode);
      }
      // A pick while a turn is STREAMING also applies to that turn (Claude
      // Code's shift+tab): the runtime mutates the executing turn's live-mode
      // ref, so the agent adopts the new mode at its next tool decision.
      // `applied: false` (the turn settled while the request flew) is benign,
      // the next send pins the mode anyway.
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
