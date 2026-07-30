export interface ObjectMetadata {
  key: string;
  size: number;
  md5: string;
  updated: string;
}

/** Manifest + object seam used by read/write shared-prefix mirrors. */
export interface ManifestObjectStore {
  manifest(prefix?: string): Promise<ObjectMetadata[]>;
  download(key: string, destFile: string): Promise<void>;
  upload(srcFile: string, key: string): Promise<void>;
}

export function isObjectMetadata(value: unknown): value is ObjectMetadata {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ObjectMetadata>;
  return (
    typeof item.key === "string" &&
    typeof item.size === "number" &&
    Number.isFinite(item.size) &&
    item.size >= 0 &&
    typeof item.md5 === "string" &&
    typeof item.updated === "string"
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
  return objects;
}
