import { ObjectNotFoundError } from "@houston/runtime-client/object-sync";
import type { FsVfs } from "./fs";
import type { Materializer } from "./lazy-store-fetch";
import type { LazyOwnership } from "./lazy-store-ownership";
import { assertSafeKey, type Vfs, VfsExistsError } from "./vfs";

export async function moveLazyStoreEntry(
  {
    vfs,
    local,
    state,
    downloads,
  }: {
    vfs: Vfs;
    local: FsVfs;
    state: LazyOwnership;
    downloads: Materializer;
  },
  fromKey: string,
  toKey: string,
): Promise<void> {
  assertSafeKey(fromKey);
  assertSafeKey(toKey);
  if (toKey === fromKey) return;
  if (toKey.startsWith(`${fromKey}/`)) {
    throw new Error(`move: destination is inside the source: ${fromKey}`);
  }
  const isFile =
    (await local.readBytes(fromKey)) !== null || state.visible(fromKey);
  if (!isFile) {
    const children = await vfs.listDetailed(fromKey);
    if (children.length === 0) {
      throw new Error(`move: source not found: ${fromKey}`);
    }
    if ((await vfs.listDetailed(toKey)).length > 0) {
      throw new VfsExistsError(toKey);
    }
    for (const child of children) {
      await vfs.move(child.key, `${toKey}${child.key.slice(fromKey.length)}`);
    }
    await local.deletePrefix(fromKey);
    return;
  }
  state.assertWritable(toKey);
  const meta = state.visible(fromKey);
  if ((await local.readBytes(fromKey)) === null && meta) {
    try {
      await downloads.fetch(fromKey, meta);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
      state.remote.delete(fromKey);
      throw new Error(`move: source not found: ${fromKey}`);
    }
  }
  if (state.visible(toKey)) throw new VfsExistsError(toKey);
  await local.move(fromKey, toKey);
  state.written(toKey);
  state.tombstone(fromKey);
}
