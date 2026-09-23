/**
 * Skills still being BUILT in chat — the unfinished creation chat and the rules
 * around it, so every surface answers them the same way.
 *
 * Building a skill in chat starts a real conversation that every mission board
 * filters out (the skill-setup sentinel below), so until the agent writes the
 * SKILL.md the chat has no home but a Skills surface. What counts as one, which
 * one "Create with chat" picks back up, which ones a list draws, and what
 * throwing one away means are decisions, not rendering — they live here.
 *
 * The chat <-> skill link is stored in both directions: the skill's frontmatter
 * `setup_activity_id` (the agent writes it) and the activity's `skill_slug`
 * (client-stamped, durable because agents never rewrite activity.json). A chat
 * either direction points at is claimed, and claimed is no longer a draft.
 */

/** A skill-setup chat as the wire serves it, in the fields these rules read. */
export interface SkillDraftActivity {
  id: string;
  /** The activity's agent-mode field, carrying the sentinel. */
  agent?: string | null;
  status?: string;
  skill_slug?: string;
  title?: string;
  /** ISO stamp of the last movement in the chat. */
  updated_at?: string;
}

/** An installed skill, in the fields that say which chat it claimed. */
export interface SkillDraftClaim {
  /** The installed skill's directory slug — its one canonical identity. */
  name: string;
  setup_activity_id?: string | null;
}

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

/**
 * Every live "skill in construction" chat: a skill-setup chat that no installed
 * skill has claimed yet, neither by forward link nor by its own `skill_slug`
 * stamp. A person can have several going at once — each is its own resumable
 * item, so this returns ALL of them.
 */
export function findDraftSkillChatActivities<A extends SkillDraftActivity>(
  activities: A[] | undefined,
  skills: SkillDraftClaim[] | undefined,
): A[] {
  const claimed = new Set<string>();
  for (const skill of skills ?? [])
    if (skill.setup_activity_id) claimed.add(skill.setup_activity_id);
  return (activities ?? []).filter(
    (a) =>
      isSkillSetupMode(a.agent) &&
      a.status !== "archived" &&
      !a.skill_slug &&
      !claimed.has(a.id),
  );
}

/** What "Create with chat" opens. */
export type CreateChatStart =
  | { kind: "wait" }
  | { kind: "resume"; activityId: string }
  | { kind: "new" };

/** What opening ONE named unfinished chat does. */
export type DraftResume =
  | { kind: "wait" }
  | { kind: "resume"; activityId: string }
  | { kind: "missing" };

/** The slice of a draft these decisions compare. */
interface DraftLike {
  id: string;
  updated_at?: string;
}

/**
 * Pick the unfinished chat back up, or start a fresh one.
 *
 * Starting a second chat while one is unfinished is what strands the first, so
 * a surface that LISTS the unfinished ones waits for the agent's chats to be
 * read. It waits for SETTLED data: a cached placeholder row carries no
 * `skill_slug` stamp, so a finished skill's chat reads as unfinished there and
 * resuming it lands the user in a conversation that vanishes the moment the
 * real read answers. A read that failed has no draft to trust either, and
 * waiting on data that never lands holds the pane on its opening state for
 * good.
 *
 * The most recently worked-on draft wins; with no stamps to compare, the list's
 * own order decides.
 */
export function resolveCreateChatStart(args: {
  /** Whether this surface draws a row for each unfinished chat. Resuming where
   *  none are listed drops the user into an older chat about another skill
   *  with nothing on screen explaining why. */
  allowResume: boolean;
  /** True once the agent's chats AND skills are real, settled data. */
  settled: boolean;
  /** True once one of those reads failed. */
  failed: boolean;
  drafts: readonly DraftLike[];
}): CreateChatStart {
  if (!args.allowResume || args.failed) return { kind: "new" };
  if (!args.settled) return { kind: "wait" };
  let newest: DraftLike | null = null;
  // Strictly later wins, so a tie (and a list with no stamps at all) keeps the
  // order the chats were read in.
  for (const draft of args.drafts)
    if (newest === null || (draft.updated_at ?? "") > (newest.updated_at ?? ""))
      newest = draft;
  return newest === null
    ? { kind: "new" }
    : { kind: "resume", activityId: newest.id };
}

/**
 * Open the ONE unfinished chat a row named — once the settled read agrees it is
 * still unfinished. The row can be older than the truth: drawn off a cached
 * placeholder, or the agent claimed the chat for a skill between the tap and
 * the read. Resuming it anyway leaves the pane on a conversation that is about
 * to disappear, so an id the settled list does not hold is reported `missing`
 * and the surface goes back to what it can show.
 */
export function resolveDraftResume(args: {
  /** True once the agent's chats AND skills are real, settled data. */
  settled: boolean;
  /** True once one of those reads failed — nothing more is coming. */
  failed: boolean;
  activityId: string;
  drafts: readonly DraftLike[];
}): DraftResume {
  if (args.failed) return { kind: "missing" };
  if (!args.settled) return { kind: "wait" };
  return args.drafts.some((d) => d.id === args.activityId)
    ? { kind: "resume", activityId: args.activityId }
    : { kind: "missing" };
}

/**
 * The rows a list draws for unfinished chats: every one of them but the chat
 * already open in the panel beside it. That chat is unclaimed until the skill
 * is written, so a row for it reads as a second, separate one.
 *
 * Nothing is drawn until the read is settled, for the same reason the resume
 * decision waits: placeholder rows carry no `skill_slug`, so every shipped
 * skill's chat would paint as an unfinished draft on a cold open.
 */
export function unfinishedDraftRows<T extends { id: string }>(args: {
  settled: boolean;
  drafts: readonly T[];
  openActivityId: string | null;
}): T[] {
  if (!args.settled) return [];
  return args.drafts.filter((draft) => draft.id !== args.openActivityId);
}

/**
 * When the chat last moved, in milliseconds, or null when it carries no usable
 * stamp. Two abandoned chats are otherwise indistinguishable in a list.
 */
export function skillDraftLastWorkedAt(
  draft: Pick<SkillDraftActivity, "updated_at">,
): number | null {
  if (!draft.updated_at) return null;
  const at = Date.parse(draft.updated_at);
  return Number.isNaN(at) ? null : at;
}

/**
 * Throw the unfinished chat away, then start its replacement.
 *
 * The order is the rule: a replacement started beside an archive that failed
 * leaves TWO unfinished chats where the user asked for one fresh start.
 */
export async function discardDraftThenRestart(steps: {
  /** Archive the chat, answering whether it is really gone. */
  archive: () => Promise<boolean>;
  startNew: () => void;
}): Promise<void> {
  if (await steps.archive()) steps.startNew();
}
