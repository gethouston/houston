import { MAX_UPLOAD_BYTES } from "@houston/host/src/turn/files-import";
import { LazyStoreVfs } from "@houston/host/src/vfs";
import type {
  HydrateManifest,
  ObjectMetadata,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import type { TurnFilesystem } from "./turn-filesystem";
import { resolveListedLayout } from "./turn-layout";
import { assertMigratedLayout } from "./turn-layout-legacy";

export async function startLazyTurnFilesystem(opts: {
  store: ObjectStore;
  listed: ObjectMetadata[];
  prefix: string;
  storeRoot: string;
  claimed: boolean;
  excludes: string[];
  maxBytes: number;
  admit?: (relativePath: string) => boolean;
  allowLegacyLayout?: boolean;
  timings?: Record<string, number>;
}): Promise<TurnFilesystem> {
  const admit = opts.admit;
  const objects = admit
    ? opts.listed.filter(({ key }) =>
        admit(opts.prefix ? key.slice(opts.prefix.length + 1) : key),
      )
    : opts.listed;
  const manifest: HydrateManifest = new Map();
  const vfs = new LazyStoreVfs({
    store: opts.store,
    prefix: opts.prefix,
    root: opts.storeRoot,
    objects,
    manifest,
    excludes: opts.excludes,
    maxObjectBytes: MAX_UPLOAD_BYTES,
    maxBytes: opts.maxBytes,
  });
  const layout = await resolveListedLayout(opts.storeRoot, vfs.remoteKeys, {
    allowEmpty: !opts.claimed,
  });
  if (opts.claimed && !opts.allowLegacyLayout)
    assertMigratedLayout(layout, vfs.remoteKeys);
  if (opts.timings) opts.timings.t_layout = performance.now();
  return {
    ...layout,
    storeRoot: opts.storeRoot,
    manifest,
    vfs,
    listedObjects: objects.length,
    skippedObjects: 0,
    generationAware: vfs.generationAware,
    immediateWrites: new Set<string>(),
  };
}
