export interface ObjectMetadata {
  key: string;
  size: number;
  md5: string;
  updated: string;
  generation?: string;
  link?: string;
  executable?: true;
}

/** One directory level: the objects directly inside it and its
 *  subdirectories, both as keys relative to the store root (no trailing
 *  slash). */
export interface DirListing {
  objects: ObjectMetadata[];
  dirs: string[];
}

/** Manifest + object seam used by read/write shared-prefix mirrors. */
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

export interface ObjectListing {
  objects: ObjectMetadata[];
  fileAttrs: boolean;
}

export function parseObjectListing(
  value: unknown,
  source: string,
): ObjectListing {
  const objects = parseObjectManifest(value, source);
  const links = (value as { links?: unknown }).links;
  if (links === undefined) return { objects, fileAttrs: false };
  if (!Array.isArray(links))
    throw new Error(`${source} returned a malformed body`);
  for (const link of links) {
    const target = (link as { target?: unknown } | null)?.target;
    if (!isObjectMetadata(link) || typeof target !== "string")
      throw new Error(`${source} returned a malformed body`);
    const { target: _target, ...metadata } = link as ObjectMetadata & {
      target: string;
    };
    objects.push({ ...normalizeObjectMetadata(metadata), link: target });
  }
  return { objects, fileAttrs: true };
}

/** Normalize the gateway's wire `gen` (JSON number or string) for int64 safety. */
export function normalizeObjectMetadata(value: ObjectMetadata): ObjectMetadata {
  const { gen: wireGeneration, ...metadata } = value as ObjectMetadata & {
    gen?: unknown;
  };
  const raw =
    typeof wireGeneration === "string" || typeof wireGeneration === "number"
      ? String(wireGeneration)
      : value.generation;
  // Generation 0 means "the backend has no generations" (GCS never mints 0;
  // 0 is only the DoesNotExist precondition). Treating it as real would flip
  // syncBack into conditional mode against a store that 501s every guarded
  // write — found by the cross-repo e2e against the dir blob backend.
  const generation = raw === undefined || raw === "0" ? undefined : raw;
  const { exec, ...rest } = metadata as ObjectMetadata & { exec?: unknown };
  const shaped: ObjectMetadata =
    exec === true ? { ...rest, executable: true } : rest;
  return generation === undefined ? shaped : { ...shaped, generation };
}

/**
 * A `?delimiter=/` manifest body, or undefined when the body has no `dirs`:
 * a pod-store that predates the delimiter answers with the recursive
 * listing, which is not one level.
 */
export function parseDirManifest(
  value: unknown,
  source: string,
): (DirListing & { fileAttrs: boolean }) | undefined {
  const { objects, fileAttrs } = parseObjectListing(value, source);
  const dirs = (value as { dirs?: unknown }).dirs;
  if (dirs === undefined) return undefined;
  if (!Array.isArray(dirs) || !dirs.every((dir) => typeof dir === "string")) {
    throw new Error(`${source} returned a malformed body`);
  }
  return {
    objects,
    dirs: dirs.map((dir) => dir.replace(/\/+$/, "")),
    fileAttrs,
  };
}
