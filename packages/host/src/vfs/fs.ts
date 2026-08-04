import { type Dirent, existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { assertSafeKey, decodeText, type ObjectStat, type Vfs } from "./vfs";

/**
 * Suffix of the scratch file `writeBytes` renames into place. Distinctive on
 * purpose: a listing hides exactly these and nothing a user could legitimately
 * name (`notes.tmp`, `backup.1.tmp` stay visible).
 */
const ATOMIC_TMP_SUFFIX = ".houston.tmp";
const isAtomicTemp = (name: string) => name.endsWith(ATOMIC_TMP_SUFFIX);

/**
 * An entry that disappeared (or whose parent turned into a file) between the
 * readdir that named it and the syscall that reads it. The workspace is live —
 * the agent writes files during a turn, pi creates and removes its
 * `auth.json.lock` dir around every credential refresh, and `writeBytes` renames
 * a temp over its target — so a walk ALWAYS races. A vanished entry is simply
 * not in the listing; anything else (EACCES, EIO) still throws, per the
 * no-silent-failures policy. Without this, one unlucky rename 500'd the whole
 * request: HOU-1176 (`GET /files` → "ENOENT … stat '…/activity.json.<n>.<x>.tmp'"),
 * plus the same crash in `list_skills`, `delete_file` and `save_attachments`.
 */
function isVanished(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Real-filesystem Vfs — the local profile's adapter. Keys map 1:1 to paths
 * under `root` (so `ws/<wsId>/<agentId>/workspace/…` is the agent's actual
 * directory and the user/agent can touch the same files directly). Every key
 * is traversal-checked; nothing outside `root` is reachable through this port.
 */
export class FsVfs implements Vfs {
  constructor(private readonly root: string) {
    if (!root) throw new Error("FsVfs requires a root directory");
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    return join(this.root, ...key.split("/"));
  }

  private async walk(
    dir: string,
    out: { path: string; size: number; mtimeMs: number; birthMs: number }[],
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isVanished(err)) return; // directory removed mid-walk
      throw err;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await this.walk(p, out);
      else if (e.isFile()) {
        // Our own in-flight atomic writes are not workspace content: they are
        // about to be renamed away, and surfacing them would leak scratch rows
        // into the Files tab and orphan tmp objects into the store sync.
        if (isAtomicTemp(e.name)) continue;
        try {
          const s = await stat(p);
          out.push({
            path: p,
            size: s.size,
            mtimeMs: s.mtimeMs,
            birthMs: s.birthtimeMs,
          });
        } catch (err) {
          if (isVanished(err)) continue; // file removed/renamed mid-walk
          throw err;
        }
      }
    }
  }

  private async statsUnder(prefix: string): Promise<ObjectStat[]> {
    const dir = this.pathFor(prefix);
    // A missing prefix, or one that resolves to a plain file, has no keys UNDER
    // it — the same answer an object store gives. Walking it would readdir() a
    // file and throw.
    try {
      if (!(await stat(dir)).isDirectory()) return [];
    } catch (err) {
      if (isVanished(err)) return [];
      throw err;
    }
    const found: {
      path: string;
      size: number;
      mtimeMs: number;
      birthMs: number;
    }[] = [];
    await this.walk(dir, found);
    return found
      .map((f) => ({
        key: f.path
          .slice(this.root.length + 1)
          .split(sep)
          .join("/"),
        size: f.size,
        updatedMs: Math.round(f.mtimeMs),
        // Linux filesystems without birthtime report 0 — omit rather than lie.
        ...(f.birthMs > 0 ? { createdMs: Math.round(f.birthMs) } : {}),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.statsUnder(prefix)).map((s) => s.key);
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    return this.statsUnder(prefix);
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

  async writeBytes(key: string, content: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // Atomic tmp+rename: a plain in-place write let concurrent readers catch a
    // TRUNCATED file — list_conversations 500'd ("not valid JSON") whenever a
    // read raced an activity.json write. The tmp lives in the same directory
    // (rename is only atomic within one filesystem) with a unique infix so
    // two concurrent writers never collide on it, and the ATOMIC_TMP_SUFFIX so
    // a concurrent walk knows to skip it.
    const unique = `${process.pid}.${Math.random().toString(36).slice(2, 8)}`;
    const tmp = `${path}.${unique}${ATOMIC_TMP_SUFFIX}`;
    await writeFile(tmp, content);
    await rename(tmp, path);
  }

  async deleteKey(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const from = this.pathFor(fromKey);
    const to = this.pathFor(toKey);
    if (!existsSync(from))
      throw new Error(`move: source not found: ${fromKey}`);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }
}
