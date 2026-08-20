import { salvageLeadingJson } from "./json-salvage";

/**
 * The domain layer's only I/O dependency: a keyed text store. The host's Vfs
 * (Memory/Gcs/Fs) satisfies this structurally, so the SAME domain code runs
 * over GCS prefixes in cloud and real directories locally — that is the
 * anti-drift point of this package.
 */
export interface TextStore {
  /** UTF-8 contents, or null when the key does not exist. */
  readText(key: string): Promise<string | null>;
  writeText(key: string, content: string): Promise<void>;
}

/** TextStore + key listing — what directory-shaped families (skills) need. */
export interface FileStore extends TextStore {
  /** All keys under `prefix/` (sorted). */
  list(prefix: string): Promise<string[]>;
}

/** A dropped/repaired entry, surfaced to the caller (beta policy: no silent loss). */
export interface DocDiagnostic {
  key: string;
  message: string;
}

/**
 * Read + parse a JSON document. Missing file → `fallback`. A file that exists
 * but does not parse THROWS with the key named — an agent-mangled file must
 * surface, not silently reset (which would destroy the user's data on the
 * next write).
 */
export async function loadJson<T>(
  store: TextStore,
  key: string,
  fallback: T,
): Promise<T> {
  const raw = await store.readText(key);
  if (raw === null) return fallback;
  // A leading byte-order mark is an encoding artifact, not content: files-first
  // docs get hand-written by agents, users and editors, and `JSON.parse` rejects
  // a BOM outright (HOU-953). The host's Vfs already drops it on decode; strip
  // here too so EVERY TextStore impl reads a BOM'd doc rather than declaring the
  // user's data corrupt over one invisible byte.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    // A complete value followed by trailing bytes (an outside writer appended
    // or overlapped the doc) keeps the value: nothing the user wrote is lost,
    // and the next save rewrites the file clean. Anything else still throws.
    const salvaged = salvageLeadingJson(text);
    if (salvaged !== undefined) return salvaged as T;
    throw new Error(
      `${key} is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/** The canonical on-disk JSON document form: pretty-printed, trailing newline. */
export function jsonDoc(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Pretty-printed write: agents and users read these files directly (files-first). */
export async function saveJson(
  store: TextStore,
  key: string,
  value: unknown,
): Promise<void> {
  await store.writeText(key, jsonDoc(value));
}
