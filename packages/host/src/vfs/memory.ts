import { assertSafeKey, type ObjectStat, type Vfs } from "./vfs";

/** In-memory Vfs for tests and CP_DEV=1. */
export class MemoryVfs implements Vfs {
  private files = new Map<
    string,
    { content: Buffer; updatedMs: number; createdMs: number }
  >();
  private clock = 1;

  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()]
      .filter((k) => k.startsWith(`${prefix}/`))
      .sort();
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    return [...this.files.entries()]
      .filter(([k]) => k.startsWith(`${prefix}/`))
      .map(([key, v]) => ({
        key,
        size: v.content.byteLength,
        updatedMs: v.updatedMs,
        createdMs: v.createdMs,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async readText(key: string): Promise<string | null> {
    return this.files.get(key)?.content.toString("utf8") ?? null;
  }

  async readBytes(key: string): Promise<Buffer | null> {
    return this.files.get(key)?.content ?? null;
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.writeBytes(key, Buffer.from(content, "utf8"));
  }

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    // An overwrite keeps the original creation time (filesystem semantics).
    const createdMs = this.files.get(key)?.createdMs ?? this.clock;
    this.files.set(key, { content, updatedMs: this.clock++, createdMs });
  }

  async deleteKey(key: string): Promise<void> {
    this.files.delete(key);
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    assertSafeKey(toKey);
    const v = this.files.get(fromKey);
    if (!v) throw new Error(`move: source not found: ${fromKey}`);
    // A move keeps the creation time — renaming a file doesn't re-create it.
    this.files.set(toKey, {
      content: v.content,
      updatedMs: this.clock++,
      createdMs: v.createdMs,
    });
    this.files.delete(fromKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const k of [...this.files.keys()]) {
      if (k.startsWith(`${prefix}/`)) this.files.delete(k);
    }
  }
}
