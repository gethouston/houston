import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, posix, relative, sep } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * The object-storage port behind workspace persistence. Keys are
 * forward-slash paths ("ws/<id>/<agent>/workspace/deck.pptx"). GcsStore is the
 * production implementation; LocalDirStore backs tests (and local dev) with a
 * plain directory so hydration logic is tested against a real filesystem
 * without GCS credentials.
 */
export interface ObjectStore {
  /** All keys under a prefix (prefix itself excluded; no delimiter semantics). */
  list(prefix: string): Promise<string[]>;
  download(key: string, destFile: string): Promise<void>;
  upload(srcFile: string, key: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class LocalDirStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private fileFor(key: string): string {
    const abs = join(this.root, ...key.split("/"));
    if (!abs.startsWith(this.root + sep)) throw new Error(`key escapes the store root: ${key}`);
    return abs;
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.fileFor(prefix);
    if (!existsSync(base)) return [];
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else out.push(posix.join(prefix, relative(base, abs).split(sep).join("/")));
      }
    };
    await walk(base);
    return out.sort();
  }

  async download(key: string, destFile: string): Promise<void> {
    await mkdir(dirname(destFile), { recursive: true });
    await pipeline(createReadStream(this.fileFor(key)), createWriteStream(destFile));
  }

  async upload(srcFile: string, key: string): Promise<void> {
    const dest = this.fileFor(key);
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(createReadStream(srcFile), createWriteStream(dest));
  }

  async delete(key: string): Promise<void> {
    const f = this.fileFor(key);
    const s = await stat(f).catch(() => null);
    if (s) await rm(f);
  }
}
