import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * The object-storage port behind durable engine state. Keys are forward-slash
 * relative paths. Production adapters can live with their owning deployment;
 * LocalDirStore keeps the synchronization contract testable against real files.
 */
export interface ObjectStore {
  /** All keys under a prefix (prefix itself excluded; no delimiter semantics). */
  list(prefix: string): Promise<string[]>;
  download(key: string, destFile: string): Promise<void>;
  upload(srcFile: string, key: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class LocalDirStore implements ObjectStore {
  private readonly resolvedRoot: string;

  constructor(root: string) {
    this.resolvedRoot = resolve(root);
  }

  private fileFor(key: string): string {
    const abs = resolve(this.resolvedRoot, ...key.split("/"));
    if (abs !== this.resolvedRoot && !abs.startsWith(this.resolvedRoot + sep)) {
      throw new Error(`key escapes the store root: ${key}`);
    }
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
        else {
          const rel = relative(base, abs).split(sep).join("/");
          out.push(prefix ? posix.join(prefix, rel) : rel);
        }
      }
    };
    await walk(base);
    return out.sort();
  }

  async download(key: string, destFile: string): Promise<void> {
    await mkdir(dirname(destFile), { recursive: true });
    await pipeline(
      createReadStream(this.fileFor(key)),
      createWriteStream(destFile),
    );
  }

  async upload(srcFile: string, key: string): Promise<void> {
    const dest = this.fileFor(key);
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(createReadStream(srcFile), createWriteStream(dest));
  }

  async delete(key: string): Promise<void> {
    const file = this.fileFor(key);
    const existing = await stat(file).catch(() => null);
    if (existing) await rm(file);
  }
}
