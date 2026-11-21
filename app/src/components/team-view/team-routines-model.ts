import type { Activity, Routine, RoutineRun } from "@houston/engine-adapter";
import type { RoutineDraft } from "@houston-ai/routines";
import { findDraftSetupActivities } from "../../lib/routine-chat-setup.ts";
import { latestRunByRoutine } from "../agent/routines-tab-model.ts";

export interface TeamRoutinesList {
  routines: Routine[];
  lastRuns: Record<string, RoutineRun>;
}

export function teamRoutinesList(
  routines: Routine[] | undefined,
  runs: RoutineRun[] | undefined,
): TeamRoutinesList {
  return { routines: routines ?? [], lastRuns: latestRunByRoutine(runs) };
}

export function teamRoutineDrafts(
  activities: Activity[] | undefined,
  routines: Routine[] | undefined,
): RoutineDraft[] {
  return findDraftSetupActivities(activities, routines).map(({ id }) => ({
    id,
  }));
}
