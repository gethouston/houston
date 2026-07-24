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
}
interface SkillLinkLike {
  /** The installed skill's directory slug — its one canonical identity. */
  name: string;
  setup_activity_id?: string | null;
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
};

/**
 * The next link repair to apply, or null when everything is consistent: a
 * skill whose forward link points at an unstamped setup chat gets the durable
 * reverse stamp written. One fix at a time — the caller applies it, queries
 * refetch, and this runs again until it returns null. (There is no reverse
 * repair rule: the forward link lives in agent-owned frontmatter, and a
 * client rewrite of SKILL.md could clobber a concurrent agent edit — the
 * reverse stamp alone keeps the chat resolvable.)
 */
export function findSkillChatHeal(
  activities: SkillSetupActivityLike[] | undefined,
  skills: SkillLinkLike[] | undefined,
): SkillChatHeal | null {
  const acts = activities ?? [];
  for (const s of skills ?? []) {
    if (!s.setup_activity_id) continue;
    const a = acts.find((x) => x.id === s.setup_activity_id);
    // Only stamp an unstamped activity — never reassign one.
    if (a && isSkillSetupMode(a.agent) && !a.skill_slug) {
      return { kind: "stamp_activity", activityId: a.id, slug: s.name };
    }
  }
  return null;
}
