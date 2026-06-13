import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { assertSafeKey, type ObjectStat, type Vfs } from "./vfs";

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

  private async walk(dir: string, out: { path: string; size: number; mtimeMs: number }[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await this.walk(p, out);
      else if (e.isFile()) {
        const s = await stat(p);
        out.push({ path: p, size: s.size, mtimeMs: s.mtimeMs });
      }
    }
  }

  private async statsUnder(prefix: string): Promise<ObjectStat[]> {
    const dir = this.pathFor(prefix);
    if (!existsSync(dir)) return [];
    const found: { path: string; size: number; mtimeMs: number }[] = [];
    await this.walk(dir, found);
    return found
      .map((f) => ({
        key: f.path.slice(this.root.length + 1).split(sep).join("/"),
        size: f.size,
        updatedMs: Math.round(f.mtimeMs),
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
    return buf ? buf.toString("utf8") : null;
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
    await writeFile(path, content);
  }

  async deleteKey(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const from = this.pathFor(fromKey);
    const to = this.pathFor(toKey);
    if (!existsSync(from)) throw new Error(`move: source not found: ${fromKey}`);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }
}
