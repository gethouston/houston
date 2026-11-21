import type { Activity, Routine } from "@houston/engine-adapter";
import type { KanbanItem } from "@houston-ai/board";
import type { RoutineRun } from "@houston-ai/routines";

export type Selection =
  | { kind: "intake" }
  | { kind: "routine"; routineId: string }
  | { kind: "routineChat"; routineId: string }
  | { kind: "runChat"; routineId: string; runId: string }
  | { kind: "draft"; activityId: string | null };

export function selectionRoutineId(selection: Selection | null): string | null {
  if (!selection) return null;
  return selection.kind === "routine" ||
    selection.kind === "routineChat" ||
    selection.kind === "runChat"
    ? selection.routineId
    : null;
}

export function clearMissingRoutine(
  current: Selection | null,
  routines: Routine[] | undefined,
): Selection | null {
  const id = selectionRoutineId(current);
  if (!id || !routines) return current;
  return routines.some((r) => r.id === id) ? current : null;
}

export function adoptDraft(
  current: Selection | null,
  activityId: string | null,
): Selection | null {
  if (current?.kind !== "draft" || current.activityId !== null) {
    return current;
  }
  return activityId ? { kind: "draft", activityId } : null;
}

export function deselectIfOn(
  current: Selection | null,
  routineId: string,
): Selection | null {
  return current?.kind === "routineChat" && current.routineId === routineId
    ? { kind: "routine", routineId }
    : current;
}

export function toggleRoutine(
  current: Selection | null,
  routineId: string,
): Selection | null {
  return selectionRoutineId(current) === routineId
    ? null
    : { kind: "routine", routineId };
}

export interface ChatSetupView {
  activityFor: (routine: Routine) => { id: string } | null;
  draftActivities: { id: string }[];
  activitiesLoaded: boolean;
}

export function claimedRoutineId(
  activityId: string,
  routines: Routine[] | undefined,
  chatSetup: ChatSetupView,
): string | undefined {
  return routines?.find((r) => chatSetup.activityFor(r)?.id === activityId)?.id;
}

export type PendingResolution =
  | { action: "open"; selection: Selection }
  | { action: "clear" }
  | { action: "wait" };

export function resolvePendingActivity(
  pendingId: string,
  routines: Routine[] | undefined,
  chatSetup: ChatSetupView,
): PendingResolution {
  const claimed = claimedRoutineId(pendingId, routines, chatSetup);
  if (claimed)
    return {
      action: "open",
      selection: { kind: "routineChat", routineId: claimed },
    };
  if (chatSetup.draftActivities.some((a) => a.id === pendingId)) {
    return {
      action: "open",
      selection: { kind: "draft", activityId: pendingId },
    };
  }
  const loaded = routines !== undefined && chatSetup.activitiesLoaded;
  return loaded ? { action: "clear" } : { action: "wait" };
}

export function setupChatItem(
  activity: Activity,
  group: string,
  sessionKey: string | null,
): KanbanItem {
  return {
    id: activity.id,
    title: activity.title,
    description: "",
    status: activity.status,
    lastMessageAt:
      activity.last_message_at ??
      activity.updated_at ??
      new Date().toISOString(),
    group,
    metadata: sessionKey ? { sessionKey } : {},
  };
}

export function runChatActivity(
  routine: Routine,
  runId: string,
  run?: RoutineRun,
): Activity {
  return {
    id: `routine-run-${runId}`,
    title: routine.name,
    description: "",
    status: run?.status === "running" ? "running" : "done",
    session_key:
      run?.session_key ??
      (routine.chat_mode === "per_run"
        ? `routine-${routine.id}-${runId}`
        : `routine-${routine.id}`),
    routine_id: routine.id,
    routine_run_id: runId,
    updated_at: run?.completed_at ?? run?.started_at ?? routine.updated_at,
  };
}

export function latestRunByRoutine(
  runs: RoutineRun[] | undefined,
): Record<string, RoutineRun> {
  if (!runs) return {};
  const map: Record<string, RoutineRun> = {};
  for (const run of runs) {
    const existing = map[run.routine_id];
    if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
      map[run.routine_id] = run;
    }
  }
  return map;
}
