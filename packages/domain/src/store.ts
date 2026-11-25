import { salvageJsonDoc } from "./json-salvage";

export interface TextStore {
  readText(key: string): Promise<string | null>;
  writeText(key: string, content: string): Promise<void>;
}

export interface FileStore extends TextStore {
  list(prefix: string): Promise<string[]>;
}

export interface DocDiagnostic {
  key: string;
  message: string;
}

export async function loadJson<T>(
  store: TextStore,
  key: string,
  fallback: T,
): Promise<T> {
  const raw = await store.readText(key);
  if (raw === null) return fallback;
  return parseJsonDoc(raw, key) as T;
}

// WHY: JSON.parse rejects a BOM; an unparsable doc throws, since a reset destroys data on next save. ADR-0084
export function parseJsonDoc(raw: string, key: string): unknown {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const salvaged = salvageJsonDoc(text);
    if (salvaged !== undefined) return salvaged;
    throw new Error(
      `${key} is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

export function jsonDoc(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function saveJson(
  store: TextStore,
  key: string,
  value: unknown,
): Promise<void> {
  await store.writeText(key, jsonDoc(value));
}
