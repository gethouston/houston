export const ROUTINE_SETUP_AGENT_MODE = "houston:routine-setup";
export const REACTION_SETUP_AGENT_MODE = "houston:reaction-setup";

export function isRoutineSetupMode(agent: string | null | undefined): boolean {
  return (
    agent === ROUTINE_SETUP_AGENT_MODE || agent === REACTION_SETUP_AGENT_MODE
  );
}

interface SetupActivityLike {
  id: string;
  agent?: string | null;
  status?: string;
  routine_id?: string;
}
interface RoutineLinkLike {
  id: string;
  setup_activity_id?: string | null;
}

export function findRoutineChatActivity<A extends SetupActivityLike>(
  activities: A[] | undefined,
  routine: RoutineLinkLike,
): A | null {
  const items = activities ?? [];
  return (
    items.find(
      (a) => isRoutineSetupMode(a.agent) && a.routine_id === routine.id,
    ) ??
    (routine.setup_activity_id
      ? (items.find((a) => a.id === routine.setup_activity_id) ?? null)
      : null)
  );
}

export function findDraftSetupActivities<A extends SetupActivityLike>(
  activities: A[] | undefined,
  routines: RoutineLinkLike[] | undefined,
): A[] {
  const claimed = new Set<string>();
  for (const r of routines ?? []) {
    if (r.setup_activity_id) claimed.add(r.setup_activity_id);
  }
  return (activities ?? []).filter(
    (a) =>
      isRoutineSetupMode(a.agent) &&
      a.status !== "archived" &&
      !a.routine_id &&
      !claimed.has(a.id),
  );
}

export type RoutineChatHeal =
  | { kind: "stamp_activity"; activityId: string; routineId: string }
  | { kind: "stamp_routine"; activityId: string; routineId: string };

export function findRoutineChatHeal(
  activities: SetupActivityLike[] | undefined,
  routines: RoutineLinkLike[] | undefined,
): RoutineChatHeal | null {
  const acts = activities ?? [];
  for (const r of routines ?? []) {
    if (r.setup_activity_id) {
      const a = acts.find((x) => x.id === r.setup_activity_id);
      if (a && isRoutineSetupMode(a.agent) && !a.routine_id) {
        return { kind: "stamp_activity", activityId: a.id, routineId: r.id };
      }
    }
    const back = acts.find(
      (x) => isRoutineSetupMode(x.agent) && x.routine_id === r.id,
    );
    if (
      back &&
      r.setup_activity_id !== back.id &&
      !acts.some((x) => x.id === r.setup_activity_id)
    ) {
      return { kind: "stamp_routine", activityId: back.id, routineId: r.id };
    }
  }
  return null;
}
