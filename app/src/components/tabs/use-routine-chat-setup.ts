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
  findDraftSetupActivities,
  findRoutineChatActivity,
  findRoutineChatHeal,
  ROUTINE_SETUP_AGENT_MODE,
} from "../../lib/routine-chat-setup";
import { tauriActivity, tauriConfig, tauriRoutines } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";

/**
 * Owns every routine's chat (HOU-725). It's a normal mission tagged with the
 * routine-setup sentinel so it never shows as a board card — its only home is
 * the Routines tab's full-page chat view. A chat starts life as a "draft" (no
 * routine yet) — a person can have several in construction at once, each its
 * own item in the list; once a routine claims one (link resolution lives in
 * `lib/routine-chat-setup.ts`, stored in both directions) that chat belongs
 * to the routine for good, and opening the routine resumes it. Routines
 * without a chat get one on first open via `startForRoutine`.
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
   *  building several routines at once. */
  const draftActivities = findDraftSetupActivities(rawItems, routines);

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
        title: t("setupChat.missionTitle"),
        agentMode: ROUTINE_SETUP_AGENT_MODE,
        modeOverride: await readAgentTurnMode(path, tauriConfig.read),
        buildPrompt: (activityId) =>
          encodeRoutineSetupMessage(activityId, connectedProvidersRef.current),
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
  }, [agent, path, pending, queryClient, t]);

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
