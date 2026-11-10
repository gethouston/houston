import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DirListing, ObjectMetadata } from "./object-manifest";
import { underObjectPrefix } from "./object-prefix";
import {
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
  type WriteOptions,
} from "./object-store";

/** A generation-aware store in memory, as pod-store answers: create-only
 *  and generation preconditions enforced, every call recorded. */
export function memoryStore(seed: Record<string, string> = {}) {
  let next = 10;
  const objects = new Map<string, { data: Buffer; generation: string }>();
  const calls: string[] = [];
  const writes: { op: string; key: string; ifGenerationMatch?: string }[] = [];
  const put = (key: string, body: string) => {
    objects.set(key, { data: Buffer.from(body), generation: String(next++) });
  };
  for (const [key, body] of Object.entries(seed)) put(key, body);
  const meta = (key: string): ObjectMetadata => {
    const object = objects.get(key);
    if (!object) throw new Error(`no ${key}`);
    return {
      key,
      size: object.data.length,
      md5: createHash("md5").update(object.data).digest("base64"),
      updated: "2026-11-10T00:00:00.000Z",
      generation: object.generation,
    };
  };
  const guard = (key: string, opts?: WriteOptions) => {
    const want = opts?.ifGenerationMatch;
    if (want === undefined) return;
    const have = objects.get(key)?.generation ?? "0";
    if (have !== want)
      throw new StoreConflictError(key, `${key} is at ${have}`);
  };
  const read = async (key: string, dest: string) => {
    calls.push(`get ${key}`);
    const object = objects.get(key);
    if (!object) throw new ObjectNotFoundError(key, `${key} not found`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, object.data);
    return { generation: object.generation };
  };
  const store: ObjectStore & {
    manifestDir(prefix?: string): Promise<DirListing>;
  } = {
    list: async (prefix) =>
      [...objects.keys()].filter((key) => underObjectPrefix(key, prefix)),
    manifest: async (prefix = "") => {
      calls.push(`manifest ${prefix}`);
      return [...objects.keys()]
        .filter((key) => underObjectPrefix(key, prefix))
        .sort()
        .map(meta);
    },
    manifestDir: async (prefix = "") => {
      calls.push(`level ${prefix}`);
      const inside = [...objects.keys()].filter((key) =>
        underObjectPrefix(key, prefix),
      );
      const base = prefix ? `${prefix}/` : "";
      const dirs = new Set<string>();
      const direct: ObjectMetadata[] = [];
      for (const key of inside.sort()) {
        const [first, ...rest] = key.slice(base.length).split("/");
        if (rest.length === 0) direct.push(meta(key));
        else dirs.add(base + first);
      }
      return { objects: direct, dirs: [...dirs].sort() };
    },
    download: read,
    downloadVersioned: read,
    upload: async (source, key, opts) => {
      writes.push({
        op: "put",
        key,
        ifGenerationMatch: opts?.ifGenerationMatch,
      });
      guard(key, opts);
      objects.set(key, {
        data: await readFile(source),
        generation: String(next++),
      });
      return { generation: objects.get(key)?.generation };
    },
    delete: async (key, opts) => {
      writes.push({
        op: "delete",
        key,
        ifGenerationMatch: opts?.ifGenerationMatch,
      });
      guard(key, opts);
      objects.delete(key);
    },
  };
  return {
    store,
    calls,
    writes,
    put,
    body: (key: string) => objects.get(key)?.data.toString(),
    generation: (key: string) => objects.get(key)?.generation,
  };
}
