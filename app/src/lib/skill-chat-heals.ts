/**
 * The link repairs behind a skill's setup chat: the durable reverse stamp a
 * forward link is missing, the orphan chat a skill lost, and the chat title
 * a rename left behind. Each finder answers ONE fix at a time; the caller
 * applies it, queries refetch, and the finder runs again until it is null.
 */

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
  /** Which rule produced the heal: `forward_link` is the normal agent-created
   *  claim (the moment a create-chat's skill first exists — the org-share
   *  default keys on it, HOU-1192); `orphan_adoption` repairs an existing
   *  skill's lost chat and must never trigger sharing. */
  reason: "forward_link" | "orphan_adoption";
};

/**
 * The next link repair to apply, or null when everything is consistent. One
 * fix at a time — the caller applies it, queries refetch, and this runs again
 * until it returns null. Two rules:
 *
 * 1. A skill whose forward link points at an unstamped setup chat gets the
 *    durable reverse stamp written (the normal agent-created claim).
 * 2. Orphan adoption: an unclaimed live setup chat whose TITLE matches
 *    exactly one chatless skill's display title is stamped as that skill's
 *    chat. This repairs a modify-chat whose link write failed mid-flight
 *    (the chat is titled with the skill's display name) — without it the
 *    skill's own chat shows forever as a bogus "draft" on the Custom tab.
 *
 * (There is no reverse repair rule: the forward link lives in agent-owned
 * frontmatter, and a client rewrite of SKILL.md could clobber a concurrent
 * agent edit — the reverse stamp alone keeps the chat resolvable.)
 */
export function findSkillChatHeal(
  activities: SkillSetupActivityLike[] | undefined,
  skills: SkillLinkLike[] | undefined,
  /** Display-title resolver (the app passes `skillDisplayTitle`); rule 2 is
   *  skipped when omitted. */
  displayTitle?: (skill: SkillLinkLike) => string,
): SkillChatHeal | null {
  const acts = activities ?? [];
  const all = skills ?? [];
  for (const s of all) {
    if (!s.setup_activity_id) continue;
    const a = acts.find((x) => x.id === s.setup_activity_id);
    // Only stamp an unstamped activity — never reassign one.
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

/**
 * The next chat-title repair, or null when titles are consistent: a skill's
 * chat keeps the skill's display title (the pane header is live, but the
 * PERSISTED activity title also surfaces — notifications, deep links — and
 * would otherwise read the old name forever after a rename; a claimed create
 * draft would stay "New skill"). One fix at a time, and a chat that two
 * skills resolve to is left alone — never flip-flop between two titles.
 */
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
