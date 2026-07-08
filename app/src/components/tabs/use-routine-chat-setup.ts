import type { Routine } from "@houston-ai/engine-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity } from "../../hooks/queries";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { logger } from "../../lib/logger";
import { providerName } from "../../lib/providers";
import { queryKeys } from "../../lib/query-keys";
import {
  type ConnectedProviderRef,
  encodeRoutineModifyMessage,
  encodeRoutineSetupMessage,
  findDraftSetupActivity,
  findRoutineChatActivity,
  findRoutineChatHeal,
  ROUTINE_SETUP_AGENT_MODE,
} from "../../lib/routine-chat-setup";
import { tauriActivity, tauriConfig, tauriRoutines } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * Owns every routine's setup chat (HOU-725). A setup chat is a normal
 * mission tagged with the routine-setup sentinel so it never shows as a
 * board card — its only home is the Routines tab's own panel
 * (`RoutineSetupChat`). A chat starts life as the agent's single "draft"
 * (no routine yet); once a routine claims it (link resolution lives in
 * `lib/routine-chat-setup.ts`, stored in both directions) the chat belongs
 * to that routine for good, and opening the routine resumes it. Routines
 * without a chat get one on first open via `startForRoutine`.
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

  // The kickoffs name the user's connected providers so the agent never pins
  // a routine to one that isn't (e.g. "use deepseek" with no DeepSeek login).
  // While statuses are still loading, `null` keeps the prompt generic instead
  // of wrongly claiming nothing is connected.
  const providerStatuses = useProviderStatuses();
  const connectedProvidersRef = useRef<ConnectedProviderRef[] | null>(null);
  connectedProvidersRef.current = providerStatuses.isLoading
    ? null
    : Object.values(providerStatuses.statuses)
        .filter((s) => s.authenticated)
        .map((s) => ({ id: s.provider, name: providerName(s.provider) }));

  /** The one unlinked, live create-chat for this agent, if any. */
  const draftActivity = findDraftSetupActivity(rawItems, routines);

  /** The persisted chat attached to a routine, or null if it has none yet. */
  const activityFor = useCallback(
    (routine: Routine) => findRoutineChatActivity(rawItems, routine),
    [rawItems],
  );

  // Link reconciliation: keep the chat↔routine link intact in BOTH stores.
  // The agent rewriting routines.json can drop `setup_activity_id` (this made
  // the open chat vanish the moment an agent-made edit landed); the durable
  // `routine_id` stamp on the activity lets us restore it. One repair per
  // pass; the invalidation refetch re-runs the effect until consistent.
  // Failures only log: this is background reconciliation (no user action to
  // toast on), and the next routines/activity refetch retries it anyway.
  const healingRef = useRef(false);
  useEffect(() => {
    if (healingRef.current) return;
    const heal = findRoutineChatHeal(rawItems, routines);
    if (!heal) return;
    healingRef.current = true;
    const apply =
      heal.kind === "stamp_activity"
        ? tauriActivity
            .update(path, heal.activityId, { routine_id: heal.routineId })
            .then(() =>
              queryClient.invalidateQueries({
                queryKey: queryKeys.activity(path),
              }),
            )
        : tauriRoutines
            .update(path, heal.routineId, {
              setup_activity_id: heal.activityId,
            })
            .then(() =>
              queryClient.invalidateQueries({
                queryKey: queryKeys.routines(path),
              }),
            );
    apply
      .catch((err) =>
        logger.error(`[routine-chat] link heal (${heal.kind}) failed: ${err}`),
      )
      .finally(() => {
        healingRef.current = false;
      });
  }, [rawItems, routines, path, queryClient]);

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
        buildPrompt: (activityId) =>
          encodeRoutineSetupMessage(activityId, connectedProvidersRef.current),
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
   * stamp the link in both directions so every future open resumes it.
   */
  const startForRoutine = useCallback(
    async (routine: Routine) => {
      if (pending) return false; // a start is already in flight — never double-create
      setPending(true);
      try {
        const { conversationId } = await createMission(
          agent,
          encodeRoutineModifyMessage(routine, connectedProvidersRef.current),
          {
            title: routine.name,
            agentMode: ROUTINE_SETUP_AGENT_MODE,
            modeOverride: await readAgentTurnMode(path, tauriConfig.read),
          },
        );
        await Promise.all([
          // The durable direction: agents never rewrite activity.json.
          tauriActivity.update(path, conversationId, {
            routine_id: routine.id,
          }),
          tauriRoutines.update(path, routine.id, {
            setup_activity_id: conversationId,
          }),
        ]);
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
