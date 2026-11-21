import { isSkillSetupMode } from "@houston/sdk/skill-drafts";

export interface SkillSetupActivityLike {
  id: string;
  agent?: string | null;
  status?: string;
  skill_slug?: string;
  title?: string;
}
export interface SkillLinkLike {
  name: string;
  title?: string | null;
  setup_activity_id?: string | null;
}

export function skillHasNoChat(
  skill: SkillLinkLike,
  activities: SkillSetupActivityLike[],
): boolean {
  return (
    !activities.some(
      (a) => isSkillSetupMode(a.agent) && a.skill_slug === skill.name,
    ) &&
    (!skill.setup_activity_id ||
      !activities.some((a) => a.id === skill.setup_activity_id))
  );
}

export function findSkillChatActivity<A extends SkillSetupActivityLike>(
  activities: A[] | undefined,
  skill: SkillLinkLike,
): A | null {
  const items = activities ?? [];
  return (
    items.find(
      (a) => isSkillSetupMode(a.agent) && a.skill_slug === skill.name,
    ) ??
    (skill.setup_activity_id
      ? (items.find((a) => a.id === skill.setup_activity_id) ?? null)
      : null)
  );
}
