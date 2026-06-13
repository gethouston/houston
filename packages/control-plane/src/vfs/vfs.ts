/** One entry's listing metadata (for the Files browser). */
export interface ObjectStat {
  key: string;
  size: number;
  updatedMs: number;
}

/**
 * The host's file-store port: keyed blobs under `ws/<workspaceId>/<agentId>/…`
 * prefixes — conversation listings, settings.json, the Files browser, agent
 * deletion. Impls: MemoryVfs (tests/dev), GcsVfs (cloud), FsVfs (local
 * profile: the agent's real directory). The runtime owns the heavy
 * hydrate/sync path; this is the boring data plane.
 *
 * Keys are forward-slash paths and never contain `.` / `..` segments — every
 * impl rejects traversal rather than trusting callers.
 */
export interface Vfs {
  /** All keys under `prefix/` (sorted). */
  list(prefix: string): Promise<string[]>;
  /** Keys under `prefix/` with size + mtime (sorted by key) — drives the Files browser. */
  listDetailed(prefix: string): Promise<ObjectStat[]>;
  /** File contents as UTF-8, or null when the key does not exist. */
  readText(key: string): Promise<string | null>;
  /** Raw bytes, or null when the key does not exist (binary downloads). */
  readBytes(key: string): Promise<Buffer | null>;
  writeText(key: string, content: string): Promise<void>;
  /** Raw-bytes write (binary uploads/seeds). Content type inferred by consumers. */
  writeBytes(key: string, content: Buffer): Promise<void>;
  /** Delete a single key. No-op when absent. */
  deleteKey(key: string): Promise<void>;
  /** Copy then delete (rename). Throws if the source is missing. */
  move(fromKey: string, toKey: string): Promise<void>;
  /** Delete every key under `prefix/` (agent deletion). */
  deletePrefix(prefix: string): Promise<void>;
}

/** Reject traversal/absolute keys before any impl maps them anywhere. */
export function assertSafeKey(key: string): void {
  if (key.startsWith("/") || key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    throw new Error(`unsafe vfs key: ${key}`);
  }
}
