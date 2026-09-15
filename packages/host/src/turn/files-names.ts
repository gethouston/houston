import { type KeyCase, type Vfs, VfsExistsError } from "../vfs";
import { FileOpError, NAME_TAKEN, READ_ONLY } from "./files-path";

/**
 * The names an agent's workspace already holds, compared the way its STORAGE
 * compares them — the cheap pre-check the files ops run before they move any
 * bytes, so a collision is a friendly refusal naming the file rather than a
 * failure at the syscall.
 *
 * `rename(2)` and an object-store overwrite both replace the destination
 * without a word, so every op that could land on an occupied name has to check
 * first. An exact-string check is not that check: on the macOS and Windows
 * default disks `readme.md` and `README.md` are ONE object, so renaming
 * `notes.md` to `README.md` beside a `readme.md` passed the guard and deleted
 * the user's file. Carrying the backend's {@link KeyCase} INSIDE the key set is
 * what makes that impossible to forget at a call site.
 *
 * It is a pre-check, never the guarantee. A volume's fold table is its own
 * (APFS resolves `STRASSE.txt` to a stored `straße.txt`, which no
 * `toLowerCase()` does), so the last word belongs to `Vfs.move`, which asks
 * the volume itself and throws `VfsExistsError`.
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
    const cased = this.keyCase.fold === "folded" ? key.toLowerCase() : key;
    // macOS stores a name DECOMPOSED (a `readdir` hands back `n` + U+0303)
    // while every browser sends it COMPOSED, so on a normalizing volume the
    // two spellings of `informe-españa.pdf` are one file and comparing the
    // bytes says they are two.
    return this.keyCase.normalize ? cased.normalize("NFC") : cased;
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
    probeKeyCase(vfs),
    vfs.listDetailed(root),
  ]);
  return new WorkspaceKeys(
    keyCase,
    stats.map((s) => s.key),
  );
}

/**
 * Learning how the volume compares names costs one scratch file, so a
 * workspace mounted read-only (a recovered disk image, a `:ro` bind mount)
 * answers EACCES here — the user's storage, not a Houston fault. Left raw it
 * 500s the request with the scratch file's name in it; named as its own state
 * it can be explained.
 */
async function probeKeyCase(vfs: Vfs): Promise<KeyCase> {
  try {
    return await vfs.keyCase();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      throw new FileOpError(403, "this workspace is read-only", READ_ONLY);
    }
    throw err;
  }
}

/**
 * Move through the vfs, turning the STORAGE's own refusal into the files ops'
 * refusal. {@link WorkspaceKeys} answers first and answers kindly, but only the
 * volume knows its fold table and its Unicode normalization, so a name it
 * considers taken can still arrive here — and the user gets the same sentence
 * either way.
 */
export async function moveOrRefuse(
  vfs: Vfs,
  fromKey: string,
  toKey: string,
  name: string,
): Promise<void> {
  try {
    await vfs.move(fromKey, toKey);
  } catch (err) {
    if (err instanceof VfsExistsError) {
      throw new FileOpError(409, `"${name}" already exists there`, NAME_TAKEN);
    }
    throw err;
  }
}
