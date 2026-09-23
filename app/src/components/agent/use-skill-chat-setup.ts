import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useActivity } from "../../hooks/queries";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import {
  findDraftSkillChatActivities,
  findSkillChatActivity,
  findSkillChatHeal,
  findSkillChatTitleHeal,
  isSkillSetupMode,
} from "../../lib/skill-chat-setup";
import { tauriActivity } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import { useOrgSkillDefault } from "./use-org-skill-default";
import { useSkillChatWrites } from "./use-skill-chat-writes";

/**
 * Owns a custom skill's setup chat (HOU-791 — a routine's setup-chat experience
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
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const {
    data: rawItems,
    isPlaceholderData,
    isError: activitiesFailed,
  } = useActivity(path);
  const writes = useSkillChatWrites(agent);
  const shareNewSkill = useOrgSkillDefault(agent);

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

  // Background reconciliation, one repair per pass (the invalidation refetch
  // re-runs the effect until consistent). Links first: an agent-created
  // skill carries the forward `setup_activity_id` but its chat has no
  // durable `skill_slug` stamp until the client writes one, and a
  // title-matched orphan chat (a stamp write that failed mid-flight) is
  // adopted back. Then titles: a skill's chat keeps the skill's display
  // title, so a rename in the conversation renames the conversation too.
  // Failures only log: there is no user action to toast on, and the next
  // refetch retries anyway.
  const healingRef = useRef(false);
  useEffect(() => {
    if (healingRef.current) return;
    const heal = findSkillChatHeal(rawItems, skills, skillDisplayTitle);
    const titleHeal = heal
      ? null
      : findSkillChatTitleHeal(rawItems, skills, skillDisplayTitle);
    const patch = heal
      ? { id: heal.activityId, update: { skill_slug: heal.slug } }
      : titleHeal
        ? { id: titleHeal.activityId, update: { title: titleHeal.title } }
        : null;
    if (!patch) return;
    healingRef.current = true;
    tauriActivity
      .update(path, patch.id, patch.update)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        // A forward-link stamp IS the "agent just created this skill in its
        // create chat" moment (rule 1 only matches an unstamped chat, so it
        // fires exactly once per creation) — apply the org-share default
        // (HOU-1192). Orphan adoption repairs an existing skill's lost chat
        // and must not share it.
        if (heal?.reason === "forward_link") shareNewSkill(heal.slug);
      })
      .catch((err) => logger.error(`[skill-chat] heal failed: ${err}`))
      .finally(() => {
        healingRef.current = false;
      });
  }, [rawItems, skills, path, queryClient, shareNewSkill]);

  return {
    draftActivities,
    activityFor,
    activityById,
    /** The raw activity list (claim heuristics need the full picture). */
    activities: rawItems,
    /** Whether that list is this agent's OWN answer. A cold open is served the
     *  cross-agent conversation cache as a placeholder, whose rows carry no
     *  `skill_slug` stamp: every claimed chat reads as an unfinished draft
     *  until the real read lands, so any decision taken on it is taken on a
     *  list that is about to change. */
    activitiesSettled: rawItems !== undefined && !isPlaceholderData,
    /** Whether the read failed outright — settledness never arrives, so a
     *  surface waiting on it needs to be told to stop waiting. */
    activitiesFailed,
    ...writes,
  };
}
