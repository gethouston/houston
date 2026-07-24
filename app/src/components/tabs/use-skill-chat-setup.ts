import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity } from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import {
  encodeSkillModifyMessage,
  encodeSkillSetupMessage,
} from "../../lib/skill-chat-prompts";
import {
  findDraftSkillChatActivities,
  findSkillChatActivity,
  findSkillChatHeal,
  isSkillSetupMode,
  SKILL_SETUP_AGENT_MODE,
} from "../../lib/skill-chat-setup";
import { tauriActivity } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import { readAgentRunOverrides } from "./routine-run-overrides";

/**
 * Owns a custom skill's setup chat (HOU-791 — the Automations-tab experience
 * on the Skills surface), tagged with the skill-setup sentinel so it never
 * shows as a board card. A chat starts as a "draft" (no skill yet); once the
 * agent creates the skill with the chat's `setup_activity_id` in its
 * frontmatter, the chat is the skill's for good and reopening the skill
 * resumes it. Skills without a chat (store installs, GitHub imports, manual
 * creates, pre-HOU-791 skills) get one on first open via `startForSkill`.
 */
export function useSkillChatSetup(
  agent: Agent,
  skills: SkillSummary[] | undefined,
) {
  const { t } = useTranslation("skills");
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const { data: rawItems } = useActivity(path);
  const [pending, setPending] = useState(false);

  const mode = SKILL_SETUP_AGENT_MODE;
  const missionTitle = t("setupChat.missionTitle");

  // Every unlinked, live create-chat for this agent — a person can be
  // building several skills at once.
  const draftActivities = findDraftSkillChatActivities(rawItems, skills);

  // The persisted chat attached to a skill, or null if it has none yet.
  const activityFor = useCallback(
    (skill: SkillSummary) => findSkillChatActivity(rawItems, skill),
    [rawItems],
  );

  // A skill-setup chat by its activity id (notification nav): the activity's
  // own `skill_slug` stamp resolves its skill without waiting on the skills
  // list, so the deep link works even mid-load.
  const activityById = useCallback(
    (id: string) =>
      (rawItems ?? []).find((a) => a.id === id && isSkillSetupMode(a.agent)) ??
      null,
    [rawItems],
  );

  // Background link reconciliation: an agent-created skill carries the
  // forward `setup_activity_id` but its chat has no durable `skill_slug`
  // stamp until the client writes one. One repair per pass; the invalidation
  // refetch re-runs the effect until consistent. Failures only log: there is
  // no user action to toast on, and the next refetch retries anyway.
  const healingRef = useRef(false);
  useEffect(() => {
    if (healingRef.current) return;
    const heal = findSkillChatHeal(rawItems, skills);
    if (!heal) return;
    healingRef.current = true;
    tauriActivity
      .update(path, heal.activityId, { skill_slug: heal.slug })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) }),
      )
      .catch((err) => logger.error(`[skill-chat] link heal failed: ${err}`))
      .finally(() => {
        healingRef.current = false;
      });
  }, [rawItems, skills, path, queryClient]);

  /**
   * Start a brand-new create-chat. Always creates a fresh one — "Create with
   * AI" means new, even while other drafts are still unfinished; those stay
   * put as their own resumable items. Returns the new activity id (or null on
   * failure) so the caller can open it right away.
   */
  const startDraft = useCallback(async () => {
    if (pending) return null; // a start is already in flight — never double-create
    setPending(true);
    try {
      // The kickoff needs the activity's own id (the agent writes it into the
      // skill's `setup_activity_id`), so the prompt is built after create.
      const { conversationId } = await createMission(agent, "", {
        title: missionTitle,
        agentMode: mode,
        // Pin the agent's configured brain onto the kickoff turn (see helper).
        ...(await readAgentRunOverrides(path)),
        // Setup chats always run as Ask first: the interview needs ask_user
        // (auto strips it) and must never open read-only in Planner.
        modeOverride: "execute",
        buildPrompt: (activityId) => encodeSkillSetupMessage(activityId),
      });
      // createMission bypasses useCreateActivity — refetch so the chat
      // view's backing activity exists before it tries to render.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("skill_chat_setup_started");
      return conversationId;
    } catch {
      // Every failure path here surfaces via call() (activity create's
      // read/write, the session send) — a toast here would double up.
      return null;
    } finally {
      setPending(false);
    }
  }, [agent, path, pending, queryClient, missionTitle]);

  /**
   * Start the persistent chat for a skill that doesn't have one yet, and
   * stamp the durable reverse link so every future open resumes it. (The
   * forward frontmatter link stays agent-owned; the client never rewrites
   * SKILL.md, so a concurrent agent edit can't be clobbered.)
   */
  const startForSkill = useCallback(
    async (skill: SkillSummary) => {
      if (pending) return false; // a start is already in flight — never double-create
      setPending(true);
      try {
        const { conversationId } = await createMission(
          agent,
          encodeSkillModifyMessage({
            slug: skill.name,
            displayName: skillDisplayTitle(skill),
          }),
          {
            title: skillDisplayTitle(skill),
            agentMode: mode,
            // Same brain pin as startDraft, and the same Ask first pin —
            // setup chats are interactive by design.
            ...(await readAgentRunOverrides(path)),
            modeOverride: "execute",
          },
        );
        // The durable direction: agents never rewrite activity.json.
        await tauriActivity.update(path, conversationId, {
          skill_slug: skill.name,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        return true;
      } catch {
        // Every failure path here surfaces via call() (createMission's
        // read/write/send, the link write) — a toast here would double up.
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
    activityById,
    /** Whether the activity query has resolved (vs. still loading) — lets the
     *  surface distinguish "no match yet" from "loaded, genuinely no match". */
    activitiesLoaded: rawItems !== undefined,
    startDraft,
    startForSkill,
    pending,
  };
}
