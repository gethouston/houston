/**
 * The write behind an unfinished creation chat: throwing one away.
 *
 * It composes the activity write rather than reaching the wire itself — a
 * skill-setup chat IS a conversation on the agent's board, so discarding one is
 * the board's own archive, and there is no second route for it. The decisions
 * around it (what counts as a draft, which one resumes, what a list draws) are
 * in `drafts.ts`.
 */

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
    // Composed from the activity write, so it reaches no wire of its own and
    // the assistant catalog lists the archive it rides instead.
    discardSkillDraft: async (agentId, activityId) => {
      await activities.setStatus(agentId, activityId, "archived");
    },
  };
}
