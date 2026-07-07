import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { encodeRoutineSetupMessage } from "../../lib/routine-chat-setup";
import { tauriConfig } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * The "Create it in chat" branch of the New-routine chooser: start a fresh
 * mission whose first message primes the agent to interview the user and
 * schedule the routine, then jump to that conversation (the same
 * view-mode + activity-panel handoff the archived-resume flow uses).
 * The routine itself is created by the agent, so the Routines grid updates
 * through the normal RoutinesChanged reactivity — nothing to do here.
 */
export function useRoutineChatSetup(agent: Agent) {
  const { t } = useTranslation("routines");
  const addToast = useUIStore((s) => s.addToast);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const [pending, setPending] = useState(false);

  const start = useCallback(async () => {
    setPending(true);
    try {
      const text = encodeRoutineSetupMessage({
        title: t("createChoice.cardTitle"),
        description: t("createChoice.cardDescription"),
      });
      const { conversationId } = await createMission(agent, text, {
        title: t("createChoice.missionTitle"),
        modeOverride: await readAgentTurnMode(
          agent.folderPath,
          tauriConfig.read,
        ),
      });
      analytics.track("routine_chat_setup_started");
      setViewMode("activity");
      setActivityPanelId(conversationId, { forceOpen: true });
      return true;
    } catch (err) {
      // The mission never started (createMission rolled the activity back),
      // so a toast is the only surface for the failure.
      addToast({
        title: t("toasts.chatSetupError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
      return false;
    } finally {
      setPending(false);
    }
  }, [agent, t, addToast, setViewMode, setActivityPanelId]);

  return { start, pending };
}
