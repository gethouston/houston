import type { Vfs } from "@houston/host/src/vfs";
import type {
  HydrateListing,
  HydrateManifest,
  HydrateOptions,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import type { ArchiveLoader } from "./turn-archive-fetch";
import type { TurnLayout } from "./turn-layout";

export interface TurnFilesystem extends TurnLayout {
  storeRoot: string;
  manifest: HydrateManifest;
  vfs: Vfs;
  listedObjects: number;
  skippedObjects: number;
  generationAware: boolean;
  immediateWrites: Set<string>;
  workspaceReady?: Promise<void>;
  abandonDeferred?: () => void;
  loadArchive?: ArchiveLoader;
}

export interface TurnFilesystemPreparation {
  filesystem: TurnFilesystem;
  hydrated: Promise<TurnFilesystem>;
  settled: Promise<
    { ok: true; filesystem: TurnFilesystem } | { ok: false; error: unknown }
  >;
  abortHydration: () => void;
}

export interface TurnFilesystemOptions {
  store: ObjectStore;
  prefix: string;
  root: string;
  claimed: boolean;
  maxBytes?: number;
  excludes?: string[];
  filter?: HydrateOptions["filter"];
  listing?: HydrateListing;
  capListed?: HydrateOptions["capListed"];
  lazy?: boolean;
  admit?: (relativePath: string) => boolean;
  allowLegacyLayout?: boolean;
}
