import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { isVanished, statsUnder } from "./fs-listing";
import { probeKeyCase, scratchPath } from "./fs-scratch";
import { writable } from "./fs-writable";
import {
  assertSafeKey,
  decodeText,
  type KeyCase,
  type ObjectStat,
  type Vfs,
  VfsExistsError,
} from "./vfs";

/**
 * Real-filesystem Vfs — the local profile's adapter. Keys map 1:1 to paths
 * under `root` (so `ws/<wsId>/<agentId>/workspace/…` is the agent's actual
 * directory and the user/agent can touch the same files directly). Every key
 * is traversal-checked; nothing outside `root` is reachable through this port.
 */
export class FsVfs implements Vfs {
  private probe?: Promise<KeyCase>;

  constructor(private readonly root: string) {
    if (!root) throw new Error("FsVfs requires a root directory");
  }

  /** Probed ONCE per root and remembered: the answer belongs to the mounted
   * volume, not to the process, so it cannot change under a running host. A
   * failed probe is not cached — a transient EIO must not decide every later
   * rename — and neither is an answer borrowed from an ancestor because `root`
   * did not exist yet. */
  keyCase(): Promise<KeyCase> {
    this.probe ??= writable(this.root, () => probeKeyCase(this.root))
      .then((result) => {
        if (!result.memoizable) this.probe = undefined;
        return result.keyCase;
      })
      .catch((err: unknown) => {
        this.probe = undefined;
        throw err;
      });
    return this.probe;
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    return join(this.root, ...key.split("/"));
  }

  /** The volume's own answer, so a fold or a normalization it performs and
   * JavaScript does not is still seen. */
  async exists(key: string): Promise<boolean> {
    return (await statOrNull(this.pathFor(key))) !== null;
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.listDetailed(prefix)).map((s) => s.key);
  }

  listDetailed(prefix: string): Promise<ObjectStat[]> {
    return statsUnder(this.root, this.pathFor(prefix));
  }

  async readText(key: string): Promise<string | null> {
    const buf = await this.readBytes(key);
    return buf ? decodeText(buf) : null;
  }

  async readBytes(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return null;
      throw err;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.writeBytes(key, Buffer.from(content, "utf8"));
  }

  writeBytes(key: string, content: Buffer): Promise<void> {
    const path = this.pathFor(key);
    return writable(key, async () => {
      await mkdir(dirname(path), { recursive: true });
      // Atomic tmp+rename: a plain in-place write let concurrent readers catch
      // a TRUNCATED file — list_conversations 500'd ("not valid JSON")
      // whenever a read raced an activity.json write. The tmp lives in the
      // same directory (rename is only atomic within one filesystem) with a
      // unique infix so two concurrent writers never collide on it, and the
      // ATOMIC_TMP_SUFFIX so a concurrent walk knows to skip it.
      const tmp = scratchPath(path);
      await writeFile(tmp, content);
      await rename(tmp, path);
    });
  }

  deleteKey(key: string): Promise<void> {
    return writable(key, () => rm(this.pathFor(key), { force: true }));
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const from = this.pathFor(fromKey);
    const to = this.pathFor(toKey);
    // `lstat`, never `stat`, on BOTH sides: `rename(2)` moves the link itself,
    // so the guard has to compare the same objects it will move. Following the
    // links instead makes a symlink and its target report one inode — read as
    // "one file, two spellings" the move is allowed, and `rename(2)` replaces
    // the user's file with a symlink pointing at itself. A broken link at the
    // destination is the mirror case: `stat` calls it absent, `lstat` sees the
    // object that would be unlinked.
    const source = await lstatOrNull(from);
    if (!source) throw new Error(`move: source not found: ${fromKey}`);
    // The last door before `rename(2)` deletes someone's file in silence, and
    // the only one that knows the volume's fold table and its Unicode
    // normalization: the destination is asked by PATH, so `STRASSE.txt` and a
    // composed `informe-españa.pdf` resolve to the neighbour that is really
    // there even though no string compare would have said so.
    //
    // Same inode = the same file under another spelling — a case-only or
    // normalization-only re-spelling the user asked for, which must still go
    // through (`rename(2)` performs it, and refusing would make the file
    // un-renameable on that volume).
    const destination = await lstatOrNull(to);
    if (destination && !sameFile(source, destination)) {
      throw new VfsExistsError(toKey);
    }
    // ACCEPTED RACE, stated rather than hidden: between the check above and
    // the `rename(2)` below, another writer could create `toKey`, and the
    // rename would then replace it silently. The window is the microseconds
    // between two syscalls, and losing it needs a second writer aiming at the
    // very same new name in that instant — not the human race (two people
    // renaming to the same name), which the caller's pre-check and its 409
    // already answer. Closing it would take `RENAME_NOREPLACE`, which Node
    // does not expose; `link(2)`+`unlink(2)` is not a substitute — hard links
    // are unsupported on exFAT and SMB (the volumes a workspace can legally
    // sit on) and illegal for directories, so it would trade a microsecond
    // race for moves that simply fail.
    //
    // Only this tail is the write, so only this tail is asked whether the
    // storage refuses writes: the two `lstat` guards above are reads, and an
    // untraversable parent fails them with the same EACCES a locked volume
    // raises. Under one wrapper around the whole move, that read failure would
    // reach the person as "we could not save there, check the folder's
    // permissions" for a file Houston could not even look at.
    await writable(toKey, async () => {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    });
  }

  deletePrefix(prefix: string): Promise<void> {
    return writable(prefix, () =>
      rm(this.pathFor(prefix), { recursive: true, force: true }),
    );
  }
}

const sameFile = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino;

/** `stat`, with "it isn't there" as a value instead of a throw. */
async function statOrNull(path: string): Promise<Stats | null> {
  return orNull(stat(path));
}

/** `lstat`, same shape: the object AT the path, links not followed. */
async function lstatOrNull(path: string): Promise<Stats | null> {
  return orNull(lstat(path));
}

async function orNull(pending: Promise<Stats>): Promise<Stats | null> {
  try {
    return await pending;
  } catch (err) {
    if (isVanished(err)) return null;
    throw err;
  }
}
