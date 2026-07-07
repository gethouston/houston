import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity } from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { queryKeys } from "../../lib/query-keys";
import {
  encodeRoutineSetupMessage,
  isRoutineSetupMode,
  ROUTINE_SETUP_AGENT_MODE,
} from "../../lib/routine-chat-setup";
import { tauriConfig } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * The "Create it in chat" branch of the New-routine chooser. The guided chat
 * is a normal mission under the hood, but tagged with the routine-setup
 * sentinel so it never shows as a board card — its only home is the Routines
 * tab's own panel (`RoutineSetupChat`). At most one setup chat is live per
 * agent: starting again resumes the existing one.
 */
export function useRoutineChatSetup(agent: Agent) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const setRoutineSetupChatAgentId = useUIStore(
    (s) => s.setRoutineSetupChatAgentId,
  );
  const { data: rawItems } = useActivity(path);
  const [pending, setPending] = useState(false);

  const setupActivity = useMemo(
    () =>
      (rawItems ?? []).find(
        (a) => isRoutineSetupMode(a.agent) && a.status !== "archived",
      ),
    [rawItems],
  );

  const openPanel = useCallback(() => {
    // Every AIBoard portals its detail panel into the SAME shared container;
    // close whatever chat another surface left open so panels never stack.
    useUIStore.getState().onPanelClose?.();
    setRoutineSetupChatAgentId(agent.id);
  }, [setRoutineSetupChatAgentId, agent.id]);

  const start = useCallback(async () => {
    if (setupActivity) {
      openPanel();
      return true;
    }
    setPending(true);
    try {
      await createMission(agent, encodeRoutineSetupMessage(), {
        title: t("createChoice.missionTitle"),
        agentMode: ROUTINE_SETUP_AGENT_MODE,
        modeOverride: await readAgentTurnMode(path, tauriConfig.read),
      });
      // createMission bypasses useCreateActivity — refetch so the panel's
      // backing activity exists before it tries to render.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("routine_chat_setup_started");
      openPanel();
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
  }, [agent, path, setupActivity, openPanel, queryClient, t, addToast]);

  return { setupActivity, start, pending };
}
