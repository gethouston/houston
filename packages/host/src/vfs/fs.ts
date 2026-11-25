import type { Stats } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { isVanished, statsUnder } from "./fs-listing";
import { readBytes } from "./fs-read";
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

export class FsVfs implements Vfs {
  private probe?: Promise<KeyCase>;

  constructor(private readonly root: string) {
    if (!root) throw new Error("FsVfs requires a root directory");
  }

  // WHY: Case folding belongs to the volume, not process.platform; a failed probe is not cached. ADR-0016
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

  readBytes(key: string, maxBytes?: number): Promise<Buffer | null> {
    return readBytes(this.pathFor(key), maxBytes);
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.writeBytes(key, Buffer.from(content, "utf8"));
  }

  writeBytes(key: string, content: Buffer): Promise<void> {
    const path = this.pathFor(key);
    return writable(key, async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = scratchPath(path);
      await writeFile(tmp, content);
      await rename(tmp, path);
    });
  }

  writeFileFrom(key: string, sourcePath: string): Promise<void> {
    const path = this.pathFor(key);
    return writable(key, async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = scratchPath(path);
      await copyFile(sourcePath, tmp);
      await rename(tmp, path);
    });
  }

  deleteKey(key: string): Promise<void> {
    return writable(key, () => rm(this.pathFor(key), { force: true }));
  }

  // WHY: lstat both sides: rename(2) moves links, so following them misreads the destination. ADR-0016
  async move(fromKey: string, toKey: string): Promise<void> {
    const from = this.pathFor(fromKey);
    const to = this.pathFor(toKey);
    const source = await lstatOrNull(from);
    if (!source) throw new Error(`move: source not found: ${fromKey}`);
    const destination = await lstatOrNull(to);
    if (destination && !sameFile(source, destination)) {
      throw new VfsExistsError(toKey);
    }
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

async function statOrNull(path: string): Promise<Stats | null> {
  return orNull(stat(path));
}

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
