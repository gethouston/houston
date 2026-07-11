/**
 * Routines — backed by the SAME `.houston/routines/routines.json` the real
 * host reads (files-first), so the Routines tab's create/edit/link flows
 * (HOU-725: the persistent setup chat rides `setup_activity_id`) can be
 * exercised end to end against this fake.
 */

import type { NewRoutine, Routine, RoutineUpdate } from "@houston/protocol";
import { emitDomain, fileKey, ISO, ROUTINES_PATH, state } from "./state-store";

export function listRoutines(agentId: string): Routine[] {
  try {
    return JSON.parse(
      state.files.get(fileKey(agentId, ROUTINES_PATH)) || "[]",
    ) as Routine[];
  } catch {
    return [];
  }
}
function setRoutines(agentId: string, items: Routine[]): void {
  state.files.set(fileKey(agentId, ROUTINES_PATH), JSON.stringify(items));
  emitDomain("RoutinesChanged", agentId);
}
export function createRoutine(
  agentId: string,
  input: Partial<NewRoutine>,
): Routine {
  const routine: Routine = {
    id: `routine-${++state.routineSeq}`,
    name: input.name ?? "Untitled routine",
    prompt: input.prompt ?? "",
    schedule: input.schedule ?? "0 9 * * *",
    enabled: input.enabled ?? true,
    suppress_when_silent: input.suppress_when_silent ?? false,
    chat_mode: input.chat_mode ?? "shared",
    integrations: input.integrations ?? [],
    provider: input.provider ?? null,
    model: input.model ?? null,
    effort: input.effort ?? null,
    ...(input.setup_activity_id
      ? { setup_activity_id: input.setup_activity_id }
      : {}),
    created_at: ISO,
    updated_at: ISO,
  };
  setRoutines(agentId, [...listRoutines(agentId), routine]);
  return routine;
}
export function updateRoutine(
  agentId: string,
  id: string,
  updates: RoutineUpdate,
): Routine | null {
  const items = listRoutines(agentId);
  const routine = items.find((r) => r.id === id);
  if (!routine) return null;
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  );
  Object.assign(routine, defined, { updated_at: ISO });
  setRoutines(agentId, items);
  return routine;
}
export function deleteRoutine(agentId: string, id: string): void {
  setRoutines(
    agentId,
    listRoutines(agentId).filter((r) => r.id !== id),
  );
}
