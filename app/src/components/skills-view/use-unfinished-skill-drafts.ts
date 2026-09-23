import type { Activity } from "@houston/engine-adapter";
import {
  findDraftSkillChatActivities,
  unfinishedDraftRows,
} from "@houston/sdk/skill-drafts";
import { useActivity } from "../../hooks/queries";
import type { Agent, SkillSummary } from "../../lib/types";

/**
 * The creation chats this AI Employee started and never finished.
 *
 * A setup chat is kept off every mission board, so until the employee writes
 * the SKILL.md its conversation has no home but this list. The library scope
 * reads none: it stands on no employee, and fanning the activity query out over
 * the whole workspace to draw a handful of rows is a cost the list does not
 * earn.
 *
 * The rows wait for the same settled data the resume decision waits for. A cold
 * open is served the cross-agent conversation cache as a placeholder, whose
 * rows carry no `skill_slug` stamp and no skills list to check them against, so
 * every shipped skill's chat would paint here as "Unfinished: New skill".
 */
export function useUnfinishedSkillDrafts(
  agent: Agent | null,
  /** folderPath → what each employee runs; a chat a skill has claimed is no
   *  longer a draft. */
  skillsByPath: ReadonlyMap<string, SkillSummary[] | undefined>,
  /** The unclaimed chat open in the panel beside the list, which is already on
   *  screen as itself. */
  openActivityId: string | null,
): Activity[] {
  const { data, isPlaceholderData } = useActivity(agent?.folderPath);
  const skills =
    agent === null ? undefined : skillsByPath.get(agent.folderPath);
  return unfinishedDraftRows({
    settled:
      agent !== null &&
      data !== undefined &&
      !isPlaceholderData &&
      skills !== undefined,
    drafts: findDraftSkillChatActivities(data, skills),
    openActivityId,
  });
}
