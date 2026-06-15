import type { Routine, RoutineFormData, RoutineRun } from "@houston-ai/routines";
import {
  validProviderOrNull,
  validModelOrNull,
  validEffortOrDefault,
  getDefaultModel,
  normalizeLegacyModel,
} from "../../lib/providers.ts";

/** Editor view state for the Routines tab. */
export type View = { type: "grid" } | { type: "editor"; editId?: string };

/**
 * Provider + model the editor's model picker should display: the routine's own
 * pin if set, else the agent's configured default, else the platform default.
 * Pure so the resolution stays out of the tab component (it always returns
 * concrete ids the picker can render).
 */
export function routineModelPickerDefaults(
  form: RoutineFormData,
  agentConfig:
    | { provider?: string | null; model?: string | null; effort?: string | null }
    | undefined,
): { provider: string; model: string; effort: string | undefined } {
  const agentModel = normalizeLegacyModel(agentConfig?.model ?? null);
  const provider =
    validProviderOrNull(form.provider ?? null) ??
    validProviderOrNull(agentConfig?.provider ?? null) ??
    "anthropic";
  const model =
    validModelOrNull(provider, form.model ?? null) ??
    validModelOrNull(provider, agentModel) ??
    getDefaultModel(provider);
  // Effort is validated against the resolved model: the routine's pin if the
  // model accepts it, else the agent's effort, else the model's default —
  // `undefined` for models with no effort control, so the picker hides.
  const effort = validEffortOrDefault(
    provider,
    model,
    form.effort ?? agentConfig?.effort ?? null,
  );
  return { provider, model, effort };
}

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
  // null = inherit the agent's provider/model/effort until the user picks.
  provider: null,
  model: null,
  effort: null,
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
    (form.provider ?? null) === (source.provider ?? null) &&
    (form.model ?? null) === (source.model ?? null) &&
    (form.effort ?? null) === (source.effort ?? null) &&
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
    provider: routine.provider ?? null,
    model: routine.model ?? null,
    effort: routine.effort ?? null,
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
