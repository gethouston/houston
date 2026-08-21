import type { ObjectStat, Vfs } from "./vfs";

/**
 * A Vfs whose keys are re-rooted under `prefix` of another Vfs. The op
 * handlers address an agent relative to the `workspaces/` directory while the
 * store-backed vfs is rooted one level up; this adapter bridges the two
 * without copying anything.
 */
export class PrefixedVfs implements Vfs {
  constructor(
    private readonly inner: Vfs,
    private readonly prefix: string,
  ) {
    if (!prefix || prefix.endsWith("/")) {
      throw new Error("PrefixedVfs needs a non-empty prefix without a slash");
    }
  }

  private key(k: string): string {
    return `${this.prefix}/${k}`;
  }

  private strip(k: string): string {
    return k.slice(this.prefix.length + 1);
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.inner.list(this.key(prefix))).map((k) => this.strip(k));
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    return (await this.inner.listDetailed(this.key(prefix))).map((s) => ({
      ...s,
      key: this.strip(s.key),
    }));
  }

  readText(key: string): Promise<string | null> {
    return this.inner.readText(this.key(key));
  }

  readBytes(key: string): Promise<Buffer | null> {
    return this.inner.readBytes(this.key(key));
  }

  writeText(key: string, content: string): Promise<void> {
    return this.inner.writeText(this.key(key), content);
  }

  writeBytes(key: string, content: Buffer): Promise<void> {
    return this.inner.writeBytes(this.key(key), content);
  }

  deleteKey(key: string): Promise<void> {
    return this.inner.deleteKey(this.key(key));
  }

  move(fromKey: string, toKey: string): Promise<void> {
    return this.inner.move(this.key(fromKey), this.key(toKey));
  }

  deletePrefix(prefix: string): Promise<void> {
    return this.inner.deletePrefix(this.key(prefix));
  }
}
