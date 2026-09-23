/**
 * The chat <-> skill link, read from both directions: the skill's frontmatter
 * `setup_activity_id` (agent-written, fragile) and the activity's `skill_slug`
 * (client-stamped, durable). The reverse link wins whenever both exist.
 */

import { isSkillSetupMode } from "@houston/sdk/skill-drafts";

export interface SkillSetupActivityLike {
  id: string;
  agent?: string | null;
  status?: string;
  skill_slug?: string;
  title?: string;
}
export interface SkillLinkLike {
  /** The installed skill's directory slug — its one canonical identity. */
  name: string;
  title?: string | null;
  setup_activity_id?: string | null;
}

/** True when NO chat resolves to this skill — neither a stamped activity nor
 *  a live forward link. The adoption heuristics (`skill-chat-setup.ts`,
 *  `skill-chat-heals.ts`) lean on it so a skill is never claimed by two chats. */
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

/** The chat attached to a skill: reverse link first (durable), then forward. */
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
