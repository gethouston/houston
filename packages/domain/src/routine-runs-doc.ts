import type { RoutineRun } from "@houston/protocol";
import { docKey } from "./layout";
import {
  type DocDiagnostic,
  loadJson,
  saveJson,
  type TextStore,
} from "./store";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function normalizeRoutineRuns(
  raw: unknown,
  key: string,
): { items: RoutineRun[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return {
      items: [],
      diagnostics: [{ key, message: "routine_runs.json is not an array" }],
    };
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
      diagnostics.push({
        key,
        message: `dropped malformed routine run: ${JSON.stringify(entry)?.slice(0, 120)}`,
      });
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

export async function saveRoutineRuns(
  store: TextStore,
  root: string,
  items: RoutineRun[],
): Promise<void> {
  await saveJson(store, docKey(root, "routine_runs"), items);
}
