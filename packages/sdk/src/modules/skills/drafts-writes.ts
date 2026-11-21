export interface SkillDraftActivityWrites {
  setStatus(
    agentId: string,
    activityId: string,
    status: string,
  ): Promise<unknown>;
}

export interface SkillDraftWrites {
  discardSkillDraft(agentId: string, activityId: string): Promise<void>;
}

export function createSkillDraftWrites(
  activities: SkillDraftActivityWrites,
): SkillDraftWrites {
  return {
    discardSkillDraft: async (agentId, activityId) => {
      await activities.setStatus(agentId, activityId, "archived");
    },
  };
}
