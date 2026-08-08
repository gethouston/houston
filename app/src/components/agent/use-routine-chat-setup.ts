import type { Routine } from "@houston-ai/engine-client";
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

/**
 * Owns every automation's setup chat (HOU-725), tagged with the setup sentinel
 * so it never shows as a board card — its only home is the Routines section's
 * setup-chat panel. A chat starts as a "draft" (no routine yet); once a routine
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
  // a routine to one that isn't (e.g. "use deepseek" with no DeepSeek login),
  // and the SAME set decides which provider the kickoff turn itself runs on
  // (PRODUCT-1236) — an agent configured for a provider the user never
  // connected must not open its setup chat there. `null` (still loading,
  // failed, or unconfirmable) keeps both decisions deferred rather than
  // claiming nothing is connected; the derivation is shared
  // (`confirmedConnectedProviders`).
  const connectedProvidersRef = useRef<ConnectedProviderRef[] | null>(null);
  connectedProvidersRef.current = useConnectedProviders();

  // Every unlinked, live create-chat for this agent — a person can be building
  // several at once (legacy reaction drafts included).
  const draftActivities = findDraftSetupActivities(rawItems, routines);

  // The persisted chat attached to a routine, or null if it has none yet.
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
   * `compose` overrides the first message the agent receives. It defaults to
   * the interview kickoff (`encodeRoutineSetupMessage`); the intake flow passes
   * the composed wake handoff instead (see `completeIntake` in
   * `use-routines-tab-view.ts`,
   * which calls `encodeRoutineIntakeHandoffMessage` with `connectedProviders`).
   */
  const startDraft = useCallback(
    async (compose?: (activityId: string) => string) => {
      if (pending) return null; // a start is already in flight — never double-create
      setPending(true);
      try {
        // The kickoff needs the activity's own id (the agent writes it into the
        // routine's `setup_activity_id`), so the prompt is built after create.
        const { conversationId } = await createMission(agent, "", {
          title: missionTitle,
          agentMode: mode,
          // Pin the agent's configured brain onto the kickoff turn, gated on
          // what the user has actually connected (see helper).
          ...(await readAgentRunOverrides(
            path,
            connectedProviderIds(connectedProvidersRef.current),
          )),
          // Setup chats always run as Ask first: the interview needs ask_user
          // (auto strips it) and must never open read-only in Planner.
          modeOverride: "execute",
          buildPrompt: (activityId) =>
            compose
              ? compose(activityId)
              : encodeRoutineSetupMessage(
                  activityId,
                  connectedProvidersRef.current,
                  eventsAvailable,
                ),
        });
        // createMission bypasses useCreateActivity — refetch so the chat
        // view's backing activity exists before it tries to render.
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
    },
    [agent, path, pending, queryClient, eventsAvailable, missionTitle],
  );

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
            // Same brain pin as startDraft (see readAgentRunOverrides), and the
            // same Ask first pin — setup chats are interactive by design.
            ...(await readAgentRunOverrides(
              path,
              connectedProviderIds(connectedProvidersRef.current),
            )),
            modeOverride: "execute",
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
     *  list distinguish "no match yet" from "loaded, genuinely no match". */
    activitiesLoaded: rawItems !== undefined,
    /** The user's connected providers (null while still loading) — the intake's
     *  wizard handoff names them so the agent never pins an unconnected one. */
    connectedProviders: connectedProvidersRef.current,
    startDraft,
    startForRoutine,
    pending,
  };
}
