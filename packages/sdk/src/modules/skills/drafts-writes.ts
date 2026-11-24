/** The activity write discarding a draft is composed from. */
export interface SkillDraftActivityWrites {
  setStatus(
    agentId: string,
    activityId: string,
    status: string,
  ): Promise<unknown>;
}

/** What a caller reaches the draft writes at. */
export interface SkillDraftWrites {
  discardSkillDraft(agentId: string, activityId: string): Promise<void>;
}

/**
 * Throwing an unfinished creation chat away is archiving its activity — the
 * conversation is kept, it just stops being offered as something to finish.
 */
export function createSkillDraftWrites(
  activities: SkillDraftActivityWrites,
): SkillDraftWrites {
  return {
    discardSkillDraft: async (agentId, activityId) => {
      await activities.setStatus(agentId, activityId, "archived");
    },
  };
}
