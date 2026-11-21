import type { Routine } from "@houston/protocol";
import { docKey } from "./layout";
import {
  type DocDiagnostic,
  loadJson,
  saveJson,
  type TextStore,
} from "./store";

export { applyRoutineUpdate, createRoutine } from "./routine-edit";
export {
  loadRoutineRuns,
  normalizeRoutineRuns,
  saveRoutineRuns,
} from "./routine-runs-doc";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isValidTriggerBinding = (v: unknown): boolean => {
  if (!isRecord(v)) return false;
  if (v.kind === "webhook") {
    return v.key_prefix === undefined || typeof v.key_prefix === "string";
  }
  return (
    typeof v.toolkit === "string" &&
    typeof v.trigger_slug === "string" &&
    isRecord(v.trigger_config)
  );
};

export function normalizeRoutines(
  raw: unknown,
  key: string,
): { items: Routine[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return {
      items: [],
      diagnostics: [{ key, message: "routines.json is not an array" }],
    };
  }
  const items: Routine[] = [];
  const diagnostics: DocDiagnostic[] = [];
  const drop = (message: string, entry: unknown) =>
    diagnostics.push({
      key,
      message: `${message}: ${JSON.stringify(entry)?.slice(0, 120)}`,
    });
  for (const entry of raw) {
    if (
      !(
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.prompt === "string"
      )
    ) {
      drop("dropped malformed routine entry", entry);
      continue;
    }
    const hasSchedule = typeof entry.schedule === "string";
    const triggerPresent = entry.trigger != null;
    if (triggerPresent && !isValidTriggerBinding(entry.trigger)) {
      drop("dropped routine with malformed trigger", entry);
      continue;
    }
    if (hasSchedule === triggerPresent) {
      drop("dropped routine without exactly one of schedule/trigger", entry);
      continue;
    }
    const item = {
      enabled: true,
      suppress_when_silent: false,
      chat_mode: entry.chat_mode === "per_run" ? "per_run" : "shared",
      integrations: Array.isArray(entry.integrations) ? entry.integrations : [],
      created_at: "",
      updated_at: "",
      ...entry,
    } as Routine & { timezone?: unknown; description?: unknown };
    delete item.timezone;
    delete item.description;
    if (!hasSchedule) delete item.schedule;
    items.push(item);
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

export async function saveRoutines(
  store: TextStore,
  root: string,
  items: Routine[],
): Promise<void> {
  await saveJson(store, docKey(root, "routines"), items);
}
