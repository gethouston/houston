/**
 * The setup chat behind a custom skill — its persistent conversation
 * (HOU-791, the Automations-tab experience applied to Skills). Each custom
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
 */

/**
 * Sentinel stored in the activity's `agent` (mode) field so every mission
 * surface can recognize a skill-setup chat. Namespaced with `houston:` so it
 * can never collide with a user-defined agent-mode id — the routine and
 * integration sentinels use the same convention.
 */
export const SKILL_SETUP_AGENT_MODE = "houston:skill-setup";

/** True when an activity's `agent` (mode) marks it as a skill-setup chat. */
export function isSkillSetupMode(agent: string | null | undefined): boolean {
  return agent === SKILL_SETUP_AGENT_MODE;
}

// ── Chat ↔ skill link resolution (pure, unit-tested) ──────────────────────

interface SkillSetupActivityLike {
  id: string;
  agent?: string | null;
  status?: string;
  skill_slug?: string;
  title?: string;
}
interface SkillLinkLike {
  /** The installed skill's directory slug — its one canonical identity. */
  name: string;
  title?: string | null;
  setup_activity_id?: string | null;
}

/** True when NO chat resolves to this skill — neither a stamped activity nor
 *  a live forward link. Used by the adoption heuristics below so a skill can
 *  never end up claimed by two chats. */
function skillHasNoChat(
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

/**
 * Every live "skill in construction" chat: a skill-setup chat that no
 * installed skill has claimed yet, neither by forward link nor by its own
 * `skill_slug` stamp. A person can have several going at once — each shows as
 * its own resumable item, so this returns ALL of them.
 */
export function findDraftSkillChatActivities<A extends SkillSetupActivityLike>(
  activities: A[] | undefined,
  skills: SkillLinkLike[] | undefined,
): A[] {
  const claimed = new Set<string>();
  for (const s of skills ?? []) {
    if (s.setup_activity_id) claimed.add(s.setup_activity_id);
  }
  return (activities ?? []).filter(
    (a) =>
      isSkillSetupMode(a.agent) &&
      a.status !== "archived" &&
      !a.skill_slug &&
      !claimed.has(a.id),
  );
}

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
