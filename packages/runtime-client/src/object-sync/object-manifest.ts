export interface ObjectMetadata {
  key: string;
  size: number;
  md5: string;
  updated: string;
  generation?: string;
}

/** Manifest + object seam used by read/write shared-prefix mirrors. */
export interface ManifestObjectStore {
  manifest(prefix?: string): Promise<ObjectMetadata[]>;
  download(key: string, destFile: string): Promise<void>;
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

/** Normalize the gateway's wire `gen` (JSON number or string) for int64 safety. */
export function normalizeObjectMetadata(value: ObjectMetadata): ObjectMetadata {
  const { gen: wireGeneration, ...metadata } = value as ObjectMetadata & {
    gen?: unknown;
  };
  const generation =
    typeof wireGeneration === "string" || typeof wireGeneration === "number"
      ? String(wireGeneration)
      : value.generation;
  return generation === undefined ? metadata : { ...metadata, generation };
}
