export interface SkillDraftActivity {
  id: string;
  agent?: string | null;
  status?: string;
  skill_slug?: string;
  title?: string;
  updated_at?: string;
}

export interface SkillDraftClaim {
  name: string;
  setup_activity_id?: string | null;
}

export const SKILL_SETUP_AGENT_MODE = "houston:skill-setup";

export function isSkillSetupMode(agent: string | null | undefined): boolean {
  return agent === SKILL_SETUP_AGENT_MODE;
}

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

export type CreateChatStart =
  | { kind: "wait" }
  | { kind: "resume"; activityId: string }
  | { kind: "new" };

export type DraftResume =
  | { kind: "wait" }
  | { kind: "resume"; activityId: string }
  | { kind: "missing" };

interface DraftLike {
  id: string;
  updated_at?: string;
}

export function resolveCreateChatStart(args: {
  allowResume: boolean;
  settled: boolean;
  failed: boolean;
  drafts: readonly DraftLike[];
}): CreateChatStart {
  if (!args.allowResume || args.failed) return { kind: "new" };
  if (!args.settled) return { kind: "wait" };
  let newest: DraftLike | null = null;
  for (const draft of args.drafts)
    if (newest === null || (draft.updated_at ?? "") > (newest.updated_at ?? ""))
      newest = draft;
  return newest === null
    ? { kind: "new" }
    : { kind: "resume", activityId: newest.id };
}

export function resolveDraftResume(args: {
  settled: boolean;
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

export function unfinishedDraftRows<T extends { id: string }>(args: {
  settled: boolean;
  drafts: readonly T[];
  openActivityId: string | null;
}): T[] {
  if (!args.settled) return [];
  return args.drafts.filter((draft) => draft.id !== args.openActivityId);
}

export function skillDraftLastWorkedAt(
  draft: Pick<SkillDraftActivity, "updated_at">,
): number | null {
  if (!draft.updated_at) return null;
  const at = Date.parse(draft.updated_at);
  return Number.isNaN(at) ? null : at;
}

export async function discardDraftThenRestart(steps: {
  archive: () => Promise<boolean>;
  startNew: () => void;
}): Promise<void> {
  if (await steps.archive()) steps.startNew();
}
