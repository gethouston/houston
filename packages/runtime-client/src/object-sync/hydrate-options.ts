export interface HydrateManifestEntry {
  hash: string;
  generation?: string;
  mergeBase?: string;
}

export type HydrateManifest = Map<string, HydrateManifestEntry>;

export interface HydrateListedObject {
  rel: string;
  size?: number;
  updated?: string;
}

export interface StartedHydration {
  manifest: HydrateManifest;
  listed: { rels: string[]; generationAware: boolean };
  skippedObjects: number;
  done: Promise<void>;
  deferred: Promise<void>;
  abort: (reason?: unknown) => void;
}

export interface HydrateListing {
  objects: readonly import("./object-manifest").ObjectMetadata[];
  reads?: readonly string[];
  later?: (
    signal: AbortSignal,
  ) => Promise<readonly import("./object-manifest").ObjectMetadata[]>;
}

export interface HydrateOptions {
  listing?: HydrateListing;
  maxBytes?: number;
  excludes?: string[];
  concurrency?: number;
  filter?: (
    rel: string,
    listing: readonly HydrateListedObject[],
    hydratedRoot: string,
  ) => boolean;
  onListed?: (listing: {
    rels: string[];
    generationAware: boolean;
  }) => void | Promise<void>;
  priority?: (rel: string) => boolean;
  defer?: (rel: string) => boolean;
  deferredMaxBytes?: number;
  deferredReadTimeoutMs?: number;
  deferredParallel?: number;
  keepMergeBase?: boolean;
  capListed?: boolean;
}
