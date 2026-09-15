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
 * Whether letter case separates two keys.
 *
 * - `exact` — byte-for-byte: object stores, and Linux filesystems.
 * - `folded` — letter case ignored, so `readme.md` and `README.md` are ONE
 *   object. The macOS and Windows defaults, where a caller that checked for a
 *   collision with an exact string compare walks straight into overwriting the
 *   user's other file.
 */
export type KeyFold = "exact" | "folded";

/**
 * How a backend decides that two keys name the SAME object.
 *
 * Both halves are properties of the mounted VOLUME, and neither can be derived
 * in JavaScript: APFS folds through the volume's own table (`straße.txt` and
 * `STRASSE.txt` are one file there, while `toLowerCase()` says they differ),
 * and it resolves a name through Unicode normalization too (macOS stores the
 * decomposed `informe-españa.pdf` a browser sends composed). A guard that
 * answers from the strings alone is right often enough to look correct and
 * wrong exactly when it deletes something.
 */
export interface KeyCase {
  fold: KeyFold;
  /** The backend resolves the NFC and NFD spellings of a name to one object. */
  normalize: boolean;
}

/**
 * The destination of a `move` is already occupied by a DIFFERENT object, so
 * completing it would destroy that object without a word. Callers that own a
 * user-facing surface turn this into their own refusal (the files ops answer
 * 409 `name_taken`); nobody may turn it into an overwrite.
 */
export class VfsExistsError extends Error {
  constructor(readonly key: string) {
    super(`vfs destination already exists: ${key}`);
    this.name = "VfsExistsError";
  }
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
  /**
   * How this backend compares keys — what a cheap batch pre-check
   * (`turn/files-names.ts`) needs in order to be friendly about a collision
   * BEFORE any bytes move. Asynchronous because a real filesystem's answer is
   * a property of the mounted volume and can only be learned by asking it
   * (see `fs-scratch.ts`). It is a pre-check, never the guarantee: `move` is.
   */
  keyCase(): Promise<KeyCase>;
  /**
   * Whether an object is already stored at this key, resolved the way THIS
   * backend resolves names. The volume's own answer, so it holds for folds and
   * normalizations no string compare knows about — which is what makes it
   * safe to decide a `writeBytes` destination (uploads) with.
   */
  exists(key: string): Promise<boolean>;
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
  /**
   * Rename. Throws if the source is missing, and throws {@link VfsExistsError}
   * rather than replacing a destination that holds a DIFFERENT object — the
   * last door before `rename(2)` deletes the user's other file in silence.
   * Re-spelling one object (a case-only or normalization-only rename on a
   * volume that folds either) is not a different object and still succeeds.
   */
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
