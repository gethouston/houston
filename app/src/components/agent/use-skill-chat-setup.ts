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

  const draftActivities = findDraftSkillChatActivities(rawItems, skills);

  const activityFor = useCallback(
    (skill: SkillSummary) => findSkillChatActivity(rawItems, skill),
    [rawItems],
  );

  const activityById = useCallback(
    (id: string) =>
      (rawItems ?? []).find((a) => a.id === id && isSkillSetupMode(a.agent)) ??
      null,
    [rawItems],
  );

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
    activities: rawItems,
    activitiesSettled: rawItems !== undefined && !isPlaceholderData,
    activitiesFailed,
    ...writes,
  };
}
