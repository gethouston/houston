import type { Activity } from "@houston/engine-adapter";
import {
  findDraftSkillChatActivities,
  unfinishedDraftRows,
} from "@houston/sdk/skill-drafts";
import { useActivity } from "../../hooks/queries";
import type { Agent, SkillSummary } from "../../lib/types";

export function useUnfinishedSkillDrafts(
  agent: Agent,
  skillsByPath: ReadonlyMap<string, SkillSummary[] | undefined>,
  openActivityId: string | null,
): Activity[] {
  const { data, isPlaceholderData } = useActivity(agent.folderPath);
  const skills = skillsByPath.get(agent.folderPath);
  return unfinishedDraftRows({
    settled: data !== undefined && !isPlaceholderData && skills !== undefined,
    drafts: findDraftSkillChatActivities(data, skills),
    openActivityId,
  });
}
