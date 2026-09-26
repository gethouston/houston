import type { Activity, Routine, RoutineRun } from "@houston/engine-adapter";
import type { RoutineDraft } from "@houston-ai/routines";
import { findDraftSetupActivities } from "../../lib/routine-chat-setup.ts";
import { latestRunByRoutine } from "../agent/routines-tab-model.ts";

/**
 * An employee's Routines list, from its two routine reads. Pure and DOM-free,
 * unit tested in `app/tests/team-routines-model.test.ts`.
 */

export interface TeamRoutinesList {
  /** The employee's routines, by their own ids. The grid orders them. */
  routines: Routine[];
  /** Latest run per routine id, ready for `RoutinesGrid`'s `lastRuns`. */
  lastRuns: Record<string, RoutineRun>;
}

/** `undefined` reads (loading or failed) contribute no rows. */
export function teamRoutinesList(
  routines: Routine[] | undefined,
  runs: RoutineRun[] | undefined,
): TeamRoutinesList {
  return { routines: routines ?? [], lastRuns: latestRunByRoutine(runs) };
}

/**
 * The employee's half-built routines as rows of the same list.
 *
 * A routine still being set up in chat exists only as an unclaimed setup
 * ACTIVITY, so no routines read can see it; without these rows a routine
 * started here would vanish the moment its chat closed. The rule that finds a
 * draft is the shared `findDraftSetupActivities`, so every surface agrees on
 * what a draft is.
 */
export function teamRoutineDrafts(
  activities: Activity[] | undefined,
  routines: Routine[] | undefined,
): RoutineDraft[] {
  return findDraftSetupActivities(activities, routines).map(({ id }) => ({
    id,
  }));
}
