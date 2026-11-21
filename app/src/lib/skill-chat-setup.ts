import {
  findDraftSkillChatActivities,
  isSkillSetupMode,
  SKILL_SETUP_AGENT_MODE,
} from "@houston/sdk/skill-drafts";
import {
  findSkillChatActivity,
  type SkillLinkLike,
  type SkillSetupActivityLike,
  skillHasNoChat,
} from "./skill-chat-link.ts";

export {
  findSkillChatHeal,
  findSkillChatTitleHeal,
  type SkillChatHeal,
  type SkillChatTitleHeal,
} from "./skill-chat-heals.ts";
export {
  findDraftSkillChatActivities,
  findSkillChatActivity,
  isSkillSetupMode,
  SKILL_SETUP_AGENT_MODE,
  type SkillLinkLike,
  type SkillSetupActivityLike,
  skillHasNoChat,
};

export function claimedSkillSlug(
  activityId: string,
  skills: SkillLinkLike[] | undefined,
): string | null {
  return (
    (skills ?? []).find((s) => s.setup_activity_id === activityId)?.name ?? null
  );
}

export function claimNewlyCreatedSkill(
  previousSlugs: ReadonlySet<string>,
  skills: SkillLinkLike[] | undefined,
  activities: SkillSetupActivityLike[] | undefined,
): string | null {
  const acts = activities ?? [];
  const arrivals = (skills ?? []).filter(
    (s) =>
      !previousSlugs.has(s.name) &&
      !s.setup_activity_id &&
      skillHasNoChat(s, acts),
  );
  return arrivals.length === 1 ? (arrivals[0]?.name ?? null) : null;
}
