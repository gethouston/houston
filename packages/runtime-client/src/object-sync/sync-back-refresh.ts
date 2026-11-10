import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import type { ObjectMetadata } from "./object-manifest";
import { ObjectNotFoundError, type ObjectStore } from "./object-store";
import type { RefreshManifest } from "./sync-back-remote-read";

/** One listing of the whole prefix, shared by every key until `fresh`. */
export function listingRefresh(
  store: ObjectStore,
  prefix: string,
): RefreshManifest {
  let listed: Promise<Map<string, ObjectMetadata>> | undefined;
  return async (key, fresh = false) => {
    if (!store.manifest) return undefined;
    if (fresh) listed = undefined;
    listed ??= store
      .manifest(prefix)
      .then(
        (objects) => new Map(objects.map((object) => [object.key, object])),
      );
    return (await listed).get(key) ?? null;
  };
}

/**
 * The one object a conflict is about, read by key with its generation: a
 * listing of a large store costs seconds (tens of thousands of keys), one
 * read costs the object. The bytes are thrown away; the conflict paths that
 * merge read the document themselves.
 */
export function keyedRefresh(
  read: NonNullable<ObjectStore["downloadVersioned"]>,
  dir: string,
): RefreshManifest {
  return async (key) => {
    const temp = atomicTempPath(join(dir, ".refresh"), randomUUID());
    try {
      const { generation, refused } = await read(key, temp);
      if (refused) return undefined;
      return {
        key,
        size: 0,
        md5: "",
        updated: "",
        ...(generation !== undefined ? { generation } : {}),
      };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return null;
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  };
}
