import type { Routine } from "@houston-ai/engine-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity } from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { queryKeys } from "../../lib/query-keys";
import {
  encodeRoutineModifyMessage,
  encodeRoutineSetupMessage,
  isRoutineSetupMode,
  ROUTINE_SETUP_AGENT_MODE,
} from "../../lib/routine-chat-setup";
import { tauriConfig, tauriRoutines } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * Owns every routine's setup chat (HOU-725). A setup chat is a normal
 * mission tagged with the routine-setup sentinel so it never shows as a
 * board card — its only home is the Routines tab's own panel
 * (`RoutineSetupChat`). A chat starts life as the agent's single "draft"
 * (no routine yet); once a routine carries its id in `setup_activity_id`
 * the chat belongs to that routine for good, and opening the routine
 * resumes it. Routines without a chat (form-created before the link
 * existed) get one on first open via `startForRoutine`.
 */
export function useRoutineChatSetup(
  agent: Agent,
  routines: Routine[] | undefined,
) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const setRoutineSetupChatAgentId = useUIStore(
    (s) => s.setRoutineSetupChatAgentId,
  );
  const { data: rawItems } = useActivity(path);
  const [pending, setPending] = useState(false);

  // Activity ids already claimed by a routine: those chats are no longer
  // drafts, they ARE that routine's chat.
  const linkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of routines ?? []) {
      if (r.setup_activity_id) ids.add(r.setup_activity_id);
    }
    return ids;
  }, [routines]);

  /** The one unlinked, live create-chat for this agent, if any. */
  const draftActivity = useMemo(
    () =>
      (rawItems ?? []).find(
        (a) =>
          isRoutineSetupMode(a.agent) &&
          a.status !== "archived" &&
          !linkedIds.has(a.id),
      ),
    [rawItems, linkedIds],
  );

  /** The persisted chat attached to a routine, or null if it has none yet. */
  const activityFor = useCallback(
    (routine: Routine) =>
      routine.setup_activity_id
        ? ((rawItems ?? []).find((a) => a.id === routine.setup_activity_id) ??
          null)
        : null,
    [rawItems],
  );

  const openPanel = useCallback(() => {
    // Every AIBoard portals its detail panel into the SAME shared container;
    // close whatever chat another surface left open so panels never stack.
    useUIStore.getState().onPanelClose?.();
    setRoutineSetupChatAgentId(agent.id);
  }, [setRoutineSetupChatAgentId, agent.id]);

  const toastStartError = useCallback(
    (err: unknown) => {
      // The mission never started (createMission rolled the activity back),
      // so a toast is the only surface for the failure.
      addToast({
        title: t("toasts.chatSetupError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    },
    [addToast, t],
  );

  /** Start (or resume) the create-chat for a brand-new routine. */
  const startDraft = useCallback(async () => {
    if (draftActivity) {
      openPanel();
      return true;
    }
    if (pending) return false; // a start is already in flight — never double-create
    setPending(true);
    try {
      // The kickoff needs the activity's own id (the agent writes it into the
      // routine's `setup_activity_id`), so the prompt is built after create.
      await createMission(agent, "", {
        title: t("setupChat.missionTitle"),
        agentMode: ROUTINE_SETUP_AGENT_MODE,
        modeOverride: await readAgentTurnMode(path, tauriConfig.read),
        buildPrompt: (activityId) => encodeRoutineSetupMessage(activityId),
      });
      // createMission bypasses useCreateActivity — refetch so the panel's
      // backing activity exists before it tries to render.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("routine_chat_setup_started");
      openPanel();
      return true;
    } catch (err) {
      toastStartError(err);
      return false;
    } finally {
      setPending(false);
    }
  }, [
    agent,
    path,
    draftActivity,
    pending,
    openPanel,
    queryClient,
    t,
    toastStartError,
  ]);

  /**
   * Start the persistent chat for a routine that doesn't have one yet, and
   * stamp the link onto the routine so every future open resumes it.
   */
  const startForRoutine = useCallback(
    async (routine: Routine) => {
      if (pending) return false; // a start is already in flight — never double-create
      setPending(true);
      try {
        const { conversationId } = await createMission(
          agent,
          encodeRoutineModifyMessage(routine),
          {
            title: routine.name,
            agentMode: ROUTINE_SETUP_AGENT_MODE,
            modeOverride: await readAgentTurnMode(path, tauriConfig.read),
          },
        );
        await tauriRoutines.update(path, routine.id, {
          setup_activity_id: conversationId,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        queryClient.invalidateQueries({ queryKey: queryKeys.routines(path) });
        openPanel();
        return true;
      } catch (err) {
        toastStartError(err);
        return false;
      } finally {
        setPending(false);
      }
    },
    [agent, path, pending, openPanel, queryClient, toastStartError],
  );

  return {
    draftActivity,
    activityFor,
    startDraft,
    startForRoutine,
    openPanel,
    pending,
  };
}
