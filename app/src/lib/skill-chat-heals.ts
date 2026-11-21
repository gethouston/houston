import {
  findDraftSkillChatActivities,
  isSkillSetupMode,
} from "@houston/sdk/skill-drafts";
import {
  findSkillChatActivity,
  type SkillLinkLike,
  type SkillSetupActivityLike,
  skillHasNoChat,
} from "./skill-chat-link.ts";

export type SkillChatHeal = {
  kind: "stamp_activity";
  activityId: string;
  slug: string;
  reason: "forward_link" | "orphan_adoption";
};

export function findSkillChatHeal(
  activities: SkillSetupActivityLike[] | undefined,
  skills: SkillLinkLike[] | undefined,
  displayTitle?: (skill: SkillLinkLike) => string,
): SkillChatHeal | null {
  const acts = activities ?? [];
  const all = skills ?? [];
  for (const s of all) {
    if (!s.setup_activity_id) continue;
    const a = acts.find((x) => x.id === s.setup_activity_id);
    if (a && isSkillSetupMode(a.agent) && !a.skill_slug) {
      return {
        kind: "stamp_activity",
        activityId: a.id,
        slug: s.name,
        reason: "forward_link",
      };
    }
  }
  if (displayTitle) {
    for (const orphan of findDraftSkillChatActivities(acts, all)) {
      if (!orphan.title) continue;
      const matches = all.filter(
        (s) => displayTitle(s) === orphan.title && skillHasNoChat(s, acts),
      );
      const match = matches.length === 1 ? matches[0] : undefined;
      if (match) {
        return {
          kind: "stamp_activity",
          activityId: orphan.id,
          slug: match.name,
          reason: "orphan_adoption",
        };
      }
    }
  }
  return null;
}

export type SkillChatTitleHeal = { activityId: string; title: string };

export function findSkillChatTitleHeal(
  activities: SkillSetupActivityLike[] | undefined,
  skills: SkillLinkLike[] | undefined,
  displayTitle: (skill: SkillLinkLike) => string,
): SkillChatTitleHeal | null {
  const acts = activities ?? [];
  const owners = new Map<string, SkillLinkLike[]>();
  for (const s of skills ?? []) {
    const chat = findSkillChatActivity(acts, s);
    if (chat) owners.set(chat.id, [...(owners.get(chat.id) ?? []), s]);
  }
  for (const [chatId, list] of owners) {
    const skill = list.length === 1 ? list[0] : undefined;
    if (!skill) continue;
    const chat = acts.find((a) => a.id === chatId);
    const want = displayTitle(skill);
    if (chat && want && chat.title !== want) {
      return { activityId: chatId, title: want };
    }
  }
  return null;
}
