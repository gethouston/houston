/** One entry's listing metadata (for the Files browser). */
export interface ObjectStat {
  key: string;
  size: number;
  updatedMs: number;
  /** Creation time (ms epoch). Absent when the backend can't report one
   * (e.g. Linux filesystems without birthtime). */
  createdMs?: number;
}

/**
 * How a backend decides that two keys name the SAME object.
 *
 * - `exact` — byte-for-byte: object stores, and Linux filesystems.
 * - `folded` — letter case ignored, so `readme.md` and `README.md` are ONE
 *   object. The macOS and Windows defaults, where a caller that checked for a
 *   collision with an exact string compare walks straight into overwriting the
 *   user's other file.
 */
export type KeyCase = "exact" | "folded";

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
  /**
   * How this backend compares keys — the question every op that must not
   * destroy an existing object asks before it writes or moves, because
   * `move`/`writeBytes` replace the destination in silence. Asynchronous
   * because a real filesystem's answer is a property of the mounted VOLUME
   * and can only be learned by asking it (see `fs-scratch.ts`).
   */
  keyCase(): Promise<KeyCase>;
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

/**
 * Decode UTF-8 file bytes, dropping a leading byte-order mark.
 *
 * A BOM is an encoding artifact, not content — but Node's decoder keeps it and
 * `JSON.parse` rejects it, so one invisible byte permanently bricks a document.
 * Houston is files-first: agents and users write `.houston` docs directly, and
 * plenty of editors and tools emit a BOM (the Windows default). A BOM-prefixed
 * routines.json stopped every routine on a pod for six days (HOU-953). Stripping
 * it at the single decode door fixes every reader at once — JSON docs, CLAUDE.md,
 * skills — and the next save rewrites the file clean, so it self-heals.
 */
export function decodeText(bytes: Buffer): string {
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reject traversal/absolute keys before any impl maps them anywhere. */
export function assertSafeKey(key: string): void {
  if (
    key.startsWith("/") ||
    key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new Error(`unsafe vfs key: ${key}`);
  }
}
