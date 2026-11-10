import type { Vfs } from "@houston/host/src/vfs";
import type {
  HydrateListing,
  HydrateManifest,
  HydrateOptions,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import type { ArchiveLoader } from "./turn-archive-fetch";
import type { TurnLayout } from "./turn-layout";

/** Hydrated manifest paired with the resolved on-disk layout. */
export interface TurnFilesystem extends TurnLayout {
  storeRoot: string;
  /** Sync-back ownership: objects on disk (and, lazily, objects owned
   *  without a download). A lazy tree grows this as handlers read. */
  manifest: HydrateManifest;
  /** Reads rooted at `storeRoot`: the real tree when hydrated, the
   *  store-backed overlay when lazy. Readers that may touch an object the
   *  op did not materialize (doc republish) go through this, never `fs`. */
  vfs: Vfs;
  /** Remote objects the lazy listing knows about (diagnostics). */
  listedObjects: number;
  skippedObjects: number;
  /** The store's generation capability as the LISTING showed it. A filtered
   *  or lazy manifest may be empty and cannot answer this on its own. */
  generationAware: boolean;
  /** Tool-call-time CAS writes already durable before the final sync pass. */
  immediateWrites: Set<string>;
  /** Objects hydration deferred past `hydrated` (turn-deferred-files.ts).
   *  Absent when nothing was deferred. Every tool, the turn's file-change
   *  snapshot and the final sync wait for it. */
  workspaceReady?: Promise<void>;
  /** The prompt is over: stop the deferred download if it has not landed,
   *  and sync as after a failed one (turn-deferred-watch.ts). */
  abandonDeferred?: () => void;
  /** Eager trees only: fetch the archive segments the hot set left remote
   *  before a reader reaches them (turn-archive-fetch.ts). */
  loadArchive?: ArchiveLoader;
}

export interface TurnFilesystemPreparation {
  filesystem: TurnFilesystem;
  hydrated: Promise<TurnFilesystem>;
  /** Attached immediately so a later synchronous setup failure cannot leave
   *  the rejecting hydration promise unobserved. Covers deferred objects. */
  settled: Promise<
    { ok: true; filesystem: TurnFilesystem } | { ok: false; error: unknown }
  >;
  abortHydration: () => void;
}

/** What a claimed or unclaimed run asks of its store tree. */
export interface TurnFilesystemOptions {
  store: ObjectStore;
  prefix: string;
  root: string;
  claimed: boolean;
  maxBytes?: number;
  /** Extra hydrate excludes (on top of the defaults), e.g. the runtime tree
   *  for an op that never reads conversations. */
  excludes?: string[];
  filter?: HydrateOptions["filter"];
  /** Eager trees only: hydrate from this listing instead of listing the
   *  store whole (turn-store-listing.ts). */
  listing?: HydrateListing;
  /** Eager trees only: a lazy tree downloads nothing up front. */
  capListed?: HydrateOptions["capListed"];
  /**
   * Download nothing up front: list the store, lay out the agent's
   * directory skeleton, and serve reads through a store-backed vfs that
   * materializes one object on first touch. Needs a store with a manifest
   * (a legacy list-only store hydrates eagerly). Only for handlers that
   * read through the vfs port; a turn's tools read the real filesystem.
   */
  lazy?: boolean;
  /** Lazy only: keep just these listed keys (see turn-filesystem-lazy.ts). */
  admit?: (relativePath: string) => boolean;
  /** Only the `migrate` op hydrates a claimed tree its boot migration has
   *  not reached; everything else refuses it (turn-layout-legacy.ts). */
  allowLegacyLayout?: boolean;
}
