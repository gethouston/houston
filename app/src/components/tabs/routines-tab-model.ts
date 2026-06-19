import type { Routine, RoutineFormData, RoutineRun } from "@houston-ai/routines";

/** Editor view state for the Routines tab. */
export type View = { type: "grid" } | { type: "editor"; editId?: string };

/** Most recent run per routine id, keyed by `routine_id`. */
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

/** Blank form for "create new routine" and the reset target on agent switch. */
export const EMPTY_FORM: RoutineFormData = {
  name: "",
  description: "",
  prompt: "",
  schedule: "0 9 * * *",
  suppress_when_silent: true,
  chat_mode: "shared",
  integrations: [],
};

function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** True when `form` has no edits relative to `source`. Gates the Save button. */
export function formMatchesRoutine(
  form: RoutineFormData,
  source: RoutineFormData,
): boolean {
  return (
    form.name === source.name &&
    form.description === source.description &&
    form.prompt === source.prompt &&
    form.schedule === source.schedule &&
    form.suppress_when_silent === source.suppress_when_silent &&
    form.chat_mode === source.chat_mode &&
    sameStringList(form.integrations, source.integrations)
  );
}

/** Project a stored routine onto the editor's form shape. */
export function routineToFormData(routine: Routine): RoutineFormData {
  return {
    name: routine.name,
    description: routine.description,
    prompt: routine.prompt,
    schedule: routine.schedule,
    suppress_when_silent: routine.suppress_when_silent,
    chat_mode: routine.chat_mode ?? "shared",
    integrations: routine.integrations ?? [],
  };
}

/**
 * Fresh Routines-tab state: grid view, blank form + baseline.
 *
 * Used both for the initial mount and when the active agent changes. The tab
 * instance is reused across agents — it's keyed by tab, not agent (see
 * experience-renderer.tsx + workspace-shell.tsx; board-tab.tsx resets its own
 * per-agent selection the same way). So a routine being edited under one agent
 * must NOT bleed into the next agent's Routines tab: switching agents drops any
 * in-progress edit and returns to that agent's grid.
 */
export function freshRoutinesState(): {
  view: View;
  form: RoutineFormData;
  baseline: RoutineFormData;
} {
  return { view: { type: "grid" }, form: EMPTY_FORM, baseline: EMPTY_FORM };
}
