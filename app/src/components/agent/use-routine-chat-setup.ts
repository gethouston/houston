import type { Routine } from "@houston/engine-adapter";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useConnectedProviders } from "../../hooks/use-connected-providers";
import { analytics } from "../../lib/analytics";
import { connectedProviderIds } from "../../lib/connected-providers";
import { createMission } from "../../lib/create-mission";
import { queryKeys } from "../../lib/query-keys";
import {
  encodeRoutineModifyMessage,
  encodeRoutineSetupMessage,
} from "../../lib/routine-chat-prompts";
import {
  findDraftSetupActivities,
  findRoutineChatActivity,
  ROUTINE_SETUP_AGENT_MODE,
} from "../../lib/routine-chat-setup";
import type { ConnectedProviderRef } from "../../lib/setup-chat-prompt-shared";
import { tauriActivity, tauriRoutines } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { readAgentRunOverrides } from "./routine-run-overrides";
import { useRoutineChatHeal } from "./use-routine-chat-heal";

export function useRoutineChatSetup(
  agent: Agent,
  routines: Routine[] | undefined,
) {
  const { t } = useTranslation("routines");
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const { data: rawItems } = useActivity(path);
  const [pending, setPending] = useState(false);
  const { capabilities } = useCapabilities();
  const eventsAvailable = !!capabilities?.triggers;

  const mode = ROUTINE_SETUP_AGENT_MODE;
  const missionTitle = t("setupChat.missionTitle");

  const connectedProvidersRef = useRef<ConnectedProviderRef[] | null>(null);
  connectedProvidersRef.current = useConnectedProviders();

  const draftActivities = findDraftSetupActivities(rawItems, routines);

  const activityFor = useCallback(
    (routine: Routine) => findRoutineChatActivity(rawItems, routine),
    [rawItems],
  );

  useRoutineChatHeal(rawItems, routines, path, queryClient);

  const startDraft = useCallback(
    async (compose?: (activityId: string) => string) => {
      if (pending) return null;
      setPending(true);
      try {
        const { conversationId } = await createMission(agent, "", {
          title: missionTitle,
          agentMode: mode,
          ...(await readAgentRunOverrides(
            path,
            connectedProviderIds(connectedProvidersRef.current),
          )),
          modeOverride: "execute",
          kickoffPrompt: (activityId) =>
            compose
              ? compose(activityId)
              : encodeRoutineSetupMessage(
                  activityId,
                  connectedProvidersRef.current,
                  eventsAvailable,
                ),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        analytics.track("routine_chat_setup_started");
        return conversationId;
      } catch {
        return null;
      } finally {
        setPending(false);
      }
    },
    [agent, path, pending, queryClient, eventsAvailable, missionTitle],
  );

  const startForRoutine = useCallback(
    async (routine: Routine) => {
      if (pending) return false;
      setPending(true);
      try {
        const { conversationId } = await createMission(
          agent,
          encodeRoutineModifyMessage(routine, connectedProvidersRef.current),
          {
            title: routine.name,
            agentMode: mode,
            ...(await readAgentRunOverrides(
              path,
              connectedProviderIds(connectedProvidersRef.current),
            )),
            modeOverride: "execute",
          },
        );
        await Promise.all([
          tauriActivity.update(path, conversationId, {
            routine_id: routine.id,
          }),
          tauriRoutines.update(path, routine.id, {
            setup_activity_id: conversationId,
          }),
        ]);
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        queryClient.invalidateQueries({ queryKey: queryKeys.routines(path) });
        return true;
      } catch {
        return false;
      } finally {
        setPending(false);
      }
    },
    [agent, path, pending, queryClient],
  );

  return {
    draftActivities,
    activityFor,
    activitiesLoaded: rawItems !== undefined,
    connectedProviders: connectedProvidersRef.current,
    startDraft,
    startForRoutine,
    pending,
  };
}
