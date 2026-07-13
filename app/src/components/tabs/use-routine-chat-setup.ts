import type { Routine } from "@houston-ai/engine-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { providerName } from "../../lib/providers";
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
import { tauriActivity, tauriConfig, tauriRoutines } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useRoutineChatHeal } from "./use-routine-chat-heal";

/**
 * Owns every automation's setup chat (HOU-725), tagged with the setup sentinel
 * so it never shows as a board card — its only home is the tab's full-page
 * chat view. A chat starts as a "draft" (no routine yet); once a routine
 * claims one (link resolution in `lib/routine-chat-setup.ts`, stored both
 * directions) the chat is the routine's for good, and reopening resumes it.
 * Routines without a chat get one on first open via `startForRoutine`. The
 * create kickoff offers the event wake only where the deployment supports
 * event triggers (`capabilities.triggers`).
 */
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

  /** Every unlinked, live create-chat for this agent — a person can be
   *  building several at once (legacy reaction drafts included). */
  const draftActivities = findDraftSetupActivities(rawItems, routines);

  /** The persisted chat attached to a routine, or null if it has none yet. */
  const activityFor = useCallback(
    (routine: Routine) => findRoutineChatActivity(rawItems, routine),
    [rawItems],
  );

  // Background chat↔routine link reconciliation, extracted to keep this file
  // under the size cap (see the hook for why both link directions are kept).
  useRoutineChatHeal(rawItems, routines, path, queryClient);

  /**
   * Start a brand-new create-chat. Always creates a fresh one — "New
   * routine" means new, even while other drafts are still unfinished; those
   * stay put as their own resumable items (`startDraft` never reuses one).
   * Returns the new activity id (or null on failure) so the caller can
   * navigate straight to it.
   */
  const startDraft = useCallback(async () => {
    if (pending) return null; // a start is already in flight — never double-create
    setPending(true);
    try {
      // The kickoff needs the activity's own id (the agent writes it into the
      // routine's `setup_activity_id`), so the prompt is built after create.
      const { conversationId } = await createMission(agent, "", {
        title: missionTitle,
        agentMode: mode,
        modeOverride: await readAgentTurnMode(path, tauriConfig.read),
        buildPrompt: (activityId) =>
          encodeRoutineSetupMessage(
            activityId,
            connectedProvidersRef.current,
            eventsAvailable,
          ),
      });
      // createMission bypasses useCreateActivity — refetch so the chat view's
      // backing activity exists before it tries to render.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("routine_chat_setup_started");
      return conversationId;
    } catch {
      // Every failure path here surfaces via call() (activity create's
      // read/write, the session send) — a toast here would double up.
      return null;
    } finally {
      setPending(false);
    }
  }, [agent, path, pending, queryClient, eventsAvailable, missionTitle]);

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
            agentMode: mode,
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
        return true;
      } catch {
        // Every failure path here surfaces via call() (createMission's
        // read/write/send, the link writes) — a toast here would double up.
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
    /** Whether the activity query has resolved (vs. still loading) — lets the
     *  tab distinguish "no match yet" from "loaded, genuinely no match". */
    activitiesLoaded: rawItems !== undefined,
    startDraft,
    startForRoutine,
    pending,
  };
}
