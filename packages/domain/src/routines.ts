import type { NewRoutine, Routine, RoutineRun, RoutineUpdate } from "@houston/protocol";
import { docKey } from "./layout";
import { loadJson, saveJson, type DocDiagnostic, type TextStore } from "./store";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Normalize raw routines: defaults per the schema; entries without identity dropped + reported. */
export function normalizeRoutines(
  raw: unknown,
  key: string,
): { items: Routine[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return { items: [], diagnostics: [{ key, message: "routines.json is not an array" }] };
  }
  const items: Routine[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.name === "string" &&
      typeof entry.prompt === "string" &&
      typeof entry.schedule === "string"
    ) {
      items.push({
        description: "",
        enabled: true,
        suppress_when_silent: false,
        chat_mode: entry.chat_mode === "per_run" ? "per_run" : "shared",
        integrations: Array.isArray(entry.integrations) ? entry.integrations : [],
        created_at: "",
        updated_at: "",
        ...entry,
      } as Routine);
    } else {
      diagnostics.push({ key, message: `dropped malformed routine entry: ${JSON.stringify(entry)?.slice(0, 120)}` });
    }
  }
  return { items, diagnostics };
}

export async function loadRoutines(
  store: TextStore,
  root: string,
): Promise<{ items: Routine[]; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "routines");
  return normalizeRoutines(await loadJson<unknown>(store, key, []), key);
}

export async function saveRoutines(store: TextStore, root: string, items: Routine[]): Promise<void> {
  await saveJson(store, docKey(root, "routines"), items);
}

/** Materialize a NewRoutine. Caller supplies identity + clock (domain stays pure). */
export function createRoutine(input: NewRoutine, id: string, nowIso: string): Routine {
  return {
    id,
    name: input.name,
    description: input.description ?? "",
    prompt: input.prompt,
    schedule: input.schedule,
    enabled: input.enabled ?? true,
    suppress_when_silent: input.suppress_when_silent ?? false,
    chat_mode: input.chat_mode ?? "shared",
    timezone: input.timezone ?? null,
    // Per-routine provider/model/effort pins. Absent (null) means inherit the
    // agent's config at dispatch — see resolveTurnModel in the runtime.
    provider: input.provider ?? null,
    model: input.model ?? null,
    effort: input.effort ?? null,
    integrations: input.integrations ?? [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/** Apply a partial update. Undefined leaves a field alone; explicit null (timezone) clears it. */
export function applyRoutineUpdate(current: Routine, update: RoutineUpdate, nowIso: string): Routine {
  const defined = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
  return { ...current, ...defined, updated_at: nowIso } as Routine;
}

/** Normalize raw routine runs (written by the scheduler; read by the UI). */
export function normalizeRoutineRuns(
  raw: unknown,
  key: string,
): { items: RoutineRun[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return { items: [], diagnostics: [{ key, message: "routine_runs.json is not an array" }] };
  }
  const items: RoutineRun[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.routine_id === "string" &&
      typeof entry.status === "string"
    ) {
      items.push({ session_key: "", started_at: "", ...entry } as RoutineRun);
    } else {
      diagnostics.push({ key, message: `dropped malformed routine run: ${JSON.stringify(entry)?.slice(0, 120)}` });
    }
  }
  return { items, diagnostics };
}

export async function loadRoutineRuns(
  store: TextStore,
  root: string,
): Promise<{ items: RoutineRun[]; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "routine_runs");
  return normalizeRoutineRuns(await loadJson<unknown>(store, key, []), key);
}

export async function saveRoutineRuns(store: TextStore, root: string, items: RoutineRun[]): Promise<void> {
  await saveJson(store, docKey(root, "routine_runs"), items);
}
