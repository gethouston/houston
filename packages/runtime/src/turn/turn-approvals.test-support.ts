import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type ObjectMetadata,
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";

export function bucket() {
  const objects = new Map<string, { body: string; generation: number }>();
  let failing = false;
  const store: ObjectStore = {
    list: async () => [...objects.keys()],
    manifest: async (): Promise<ObjectMetadata[]> =>
      [...objects].map(([key, value]) => ({
        key,
        size: value.body.length,
        md5: "",
        updated: "2026-10-01T00:00:00.000Z",
        generation: String(value.generation),
      })),
    download: async (key, dest) => {
      const object = objects.get(key);
      if (!object) throw new ObjectNotFoundError(key, "absent");
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, object.body);
    },
    upload: async (src, key, options) => {
      if (failing) throw new Error("store unavailable");
      const current = objects.get(key);
      const want = options?.ifGenerationMatch;
      if (want !== undefined && want !== String(current?.generation ?? 0))
        throw new StoreConflictError(key, "stale");
      const generation = (current?.generation ?? 0) + 1;
      objects.set(key, { body: await readFile(src, "utf8"), generation });
      return { generation: String(generation) };
    },
    delete: async (key) => {
      objects.delete(key);
    },
  };
  return {
    store,
    objects,
    failWrites: () => {
      failing = true;
    },
  };
}
