import type { AgentConfig, Learning } from "@houston/protocol";
import { docKey } from "./layout";
import {
  type DocDiagnostic,
  loadJson,
  saveJson,
  type TextStore,
} from "./store";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** config.json is a single object; a non-object file is reported and treated as empty. */
export async function loadConfig(
  store: TextStore,
  root: string,
): Promise<{ config: AgentConfig; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "config");
  const raw = await loadJson<unknown>(store, key, {});
  if (!isRecord(raw)) {
    return {
      config: {},
      diagnostics: [{ key, message: "config.json is not an object" }],
    };
  }
  return { config: raw as AgentConfig, diagnostics: [] };
}

export async function saveConfig(
  store: TextStore,
  root: string,
  config: AgentConfig,
): Promise<void> {
  await saveJson(store, docKey(root, "config"), config);
}

export function normalizeLearnings(
  raw: unknown,
  key: string,
): { items: Learning[]; diagnostics: DocDiagnostic[] } {
  if (raw === null || raw === undefined) return { items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return {
      items: [],
      diagnostics: [{ key, message: "learnings.json is not an array" }],
    };
  }
  const items: Learning[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.text === "string"
    ) {
      items.push({ created_at: "", ...entry } as Learning);
    } else {
      diagnostics.push({
        key,
        message: `dropped malformed learning: ${JSON.stringify(entry)?.slice(0, 120)}`,
      });
    }
  }
  return { items, diagnostics };
}

export async function loadLearnings(
  store: TextStore,
  root: string,
): Promise<{ items: Learning[]; diagnostics: DocDiagnostic[] }> {
  const key = docKey(root, "learnings");
  return normalizeLearnings(await loadJson<unknown>(store, key, []), key);
}

export async function saveLearnings(
  store: TextStore,
  root: string,
  items: Learning[],
): Promise<void> {
  await saveJson(store, docKey(root, "learnings"), items);
}
