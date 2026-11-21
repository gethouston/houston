export interface ObjectMetadata {
  key: string;
  size: number;
  md5: string;
  updated: string;
  generation?: string;
}

export interface DirListing {
  objects: ObjectMetadata[];
  dirs: string[];
}

export interface ManifestObjectStore {
  manifest(prefix?: string): Promise<ObjectMetadata[]>;
  download(
    key: string,
    destFile: string,
    // biome-ignore lint/suspicious/noConfusingVoidType: additive port widening must accept existing void-returning stores.
  ): Promise<import("./object-store").ReadResult | void>;
  upload(
    srcFile: string,
    key: string,
    opts?: import("./object-store").WriteOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: additive port widening must accept existing void-returning stores.
  ): Promise<import("./object-store").WriteResult | void>;
}

export function isObjectMetadata(value: unknown): value is ObjectMetadata {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ObjectMetadata>;
  const gen = (value as { gen?: unknown }).gen;
  return (
    typeof item.key === "string" &&
    typeof item.size === "number" &&
    Number.isFinite(item.size) &&
    item.size >= 0 &&
    typeof item.md5 === "string" &&
    typeof item.updated === "string" &&
    (gen === undefined ||
      typeof gen === "string" ||
      (typeof gen === "number" && Number.isFinite(gen)))
  );
}

export function parseObjectManifest(
  value: unknown,
  source: string,
): ObjectMetadata[] {
  if (!value || typeof value !== "object" || !("objects" in value)) {
    throw new Error(`${source} returned a malformed body`);
  }
  const { objects } = value as { objects: unknown };
  if (!Array.isArray(objects) || !objects.every(isObjectMetadata)) {
    throw new Error(`${source} returned a malformed body`);
  }
  return objects.map((object) => normalizeObjectMetadata(object));
}

export function normalizeObjectMetadata(value: ObjectMetadata): ObjectMetadata {
  const { gen: wireGeneration, ...metadata } = value as ObjectMetadata & {
    gen?: unknown;
  };
  const raw =
    typeof wireGeneration === "string" || typeof wireGeneration === "number"
      ? String(wireGeneration)
      : value.generation;
  const generation = raw === undefined || raw === "0" ? undefined : raw;
  return generation === undefined ? metadata : { ...metadata, generation };
}

export function parseDirManifest(
  value: unknown,
  source: string,
): DirListing | undefined {
  const objects = parseObjectManifest(value, source);
  const dirs = (value as { dirs?: unknown }).dirs;
  if (dirs === undefined) return undefined;
  if (!Array.isArray(dirs) || !dirs.every((dir) => typeof dir === "string")) {
    throw new Error(`${source} returned a malformed body`);
  }
  return { objects, dirs: dirs.map((dir) => dir.replace(/\/+$/, "")) };
}
