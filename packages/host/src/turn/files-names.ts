import type { KeyCase, Vfs } from "../vfs";

/**
 * The names an agent's workspace already holds, compared the way its STORAGE
 * compares them — the one place the files ops ask "is this name free?".
 *
 * `rename(2)` and an object-store overwrite both replace the destination
 * without a word, so every op that could land on an occupied name has to check
 * first. An exact-string check is not that check: on the macOS and Windows
 * default disks `readme.md` and `README.md` are ONE object, so renaming
 * `notes.md` to `README.md` beside a `readme.md` passed the guard and deleted
 * the user's file. Carrying the backend's {@link KeyCase} INSIDE the key set is
 * what makes that impossible to forget at a call site.
 */
export class WorkspaceKeys {
  /** Existing keys, each in the spelling this backend compares by. */
  private readonly names = new Set<string>();

  constructor(
    readonly keyCase: KeyCase,
    keys: Iterable<string>,
  ) {
    for (const key of keys) this.add(key);
  }

  private compare(key: string): string {
    return this.keyCase === "folded" ? key.toLowerCase() : key;
  }

  /** Record a key an op is about to write, so the next question accounts for it. */
  add(key: string): void {
    this.names.add(this.compare(key));
  }

  /** Whether a FILE with this key is already stored. */
  has(key: string): boolean {
    return this.names.has(this.compare(key));
  }

  /**
   * Whether `key` names something already there — a file's own key, or the
   * prefix of a directory's children, since a directory has no key of its own
   * in an object store.
   */
  taken(key: string): boolean {
    if (this.has(key)) return true;
    const prefix = this.compare(`${key}/`);
    for (const name of this.names) if (name.startsWith(prefix)) return true;
    return false;
  }

  /**
   * Whether two keys address the SAME stored object here. True for a case-only
   * rename on a folded disk (`readme.md` → `README.md`), which is a rename the
   * user asked for and got — neither a collision nor a no-op.
   */
  sameSlot(a: string, b: string): boolean {
    return this.compare(a) === this.compare(b);
  }
}

/** Every key under `root`, paired with the backend's own name comparison. */
export async function loadWorkspaceKeys(
  vfs: Vfs,
  root: string,
): Promise<WorkspaceKeys> {
  const [keyCase, stats] = await Promise.all([
    vfs.keyCase(),
    vfs.listDetailed(root),
  ]);
  return new WorkspaceKeys(
    keyCase,
    stats.map((s) => s.key),
  );
}
