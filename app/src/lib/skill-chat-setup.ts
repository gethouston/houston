/**
 * The setup chat behind a custom skill — its persistent conversation
 * (HOU-791, a routine's setup-chat experience applied to Skills). Each custom
 * skill gets exactly one: building it with the agent starts the chat, and
 * reopening the skill resumes the very same conversation instead of a manual
 * editor.
 *
 * New chats carry `SKILL_SETUP_AGENT_MODE`; board surfaces hide it via
 * `isSetupChatMode` (`integration-chat-setup.ts`), the shared predicate for
 * every guided-setup sentinel. The kickoff prompts live in
 * `skill-chat-prompts.ts`. This module owns the sentinel and the chat <->
 * skill link resolution.
 *
 * The chat <-> skill link is stored in both directions, the same shape as
 * routines: the skill's frontmatter `setup_activity_id` (written by the agent
 * when it creates the skill) and the activity's `skill_slug` (client-stamped,
 * durable because agents never rewrite activity.json). The frontmatter side
 * is fragile — the agent rewrites SKILL.md whenever it edits the skill — so
 * resolution trusts the reverse link first and a heal restores the missing
 * activity stamp.
 *
 * The sentinel, and which chats are still unfinished DRAFTS, are the SDK's
 * (`@houston/sdk/skill-drafts`) so every surface classifies them alike; this
 * module adds the link resolution, and `skill-chat-heals.ts` the repairs the
 * app applies on top.
 */

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
// The link shapes and resolution, and the repairs the app applies on top.
export {
  findDraftSkillChatActivities,
  findSkillChatActivity,
  isSkillSetupMode,
  SKILL_SETUP_AGENT_MODE,
  type SkillLinkLike,
  type SkillSetupActivityLike,
  skillHasNoChat,
};

/**
 * The slug of the skill that claimed a draft chat (the agent created it with
 * `setup_activity_id` pointing back at the chat), or null while unclaimed.
 * The view swaps its draft selection to the skill's chat on this signal so
 * the SAME conversation continues seamlessly.
 */
export function claimedSkillSlug(
  activityId: string,
  skills: SkillLinkLike[] | undefined,
): string | null {
  return (
    (skills ?? []).find((s) => s.setup_activity_id === activityId)?.name ?? null
  );
}

/**
 * The create-flow claim FALLBACK: the kickoff tells the agent to write the
 * chat's id into the new skill's frontmatter, but an agent that forgets it
 * would strand the draft forever. While the user sits in a draft chat, a
 * skill that newly APPEARED in the list (vs. the previous fetch), has no
 * forward link, and no chat of its own is — if it is the only such arrival —
 * unambiguously the skill this conversation just created.
 */
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
