import {
  type HydrateManifest,
  type ObjectStore,
  type SyncResult,
  syncBack,
} from "@houston/runtime-client/object-sync";

export const DEFAULT_QUIET_MS = 3_000;
export const DEFAULT_INTERVAL_MS = 300_000;
/** Leave headroom in the pod's 10 GiB emptyDir for excluded scratch data. */
export const DEFAULT_MAX_HYDRATE_BYTES = 9 * 1024 * 1024 * 1024;

export const STORE_SYNC_EXCLUDES = [
  "credentials.json",
  "claude-login/.credentials.json",
  "db/",
  "shared-mirror/",
];

export interface StoreSyncOptions {
  store: ObjectStore;
  rootDir: string;
  excludes?: string[];
  /** Absolute paths omitted from watcher traversal but covered periodically. */
  watchExcludeDirs?: string[];
  quietMs?: number;
  intervalMs?: number;
  maxHydrateBytes?: number;
  log: (msg: string, err?: unknown) => void;
}

export function runSyncBack(
  opts: StoreSyncOptions,
  manifest: HydrateManifest,
  excludes: string[],
): Promise<SyncResult> {
  return syncBack(opts.store, "", opts.rootDir, manifest, { excludes });
}

export function logHydrated(
  opts: StoreSyncOptions,
  objectCount: number,
  startedAt: number,
): void {
  opts.log(
    `[store-sync] hydrated ${objectCount} objects in ${Date.now() - startedAt}ms`,
  );
}

export function logSyncResult(
  result: SyncResult,
  opts: StoreSyncOptions,
): void {
  for (const skip of result.skipped) {
    opts.log(
      `[store-sync] ${skip.key} exceeds the store's per-object cap and stays pod-local until it changes (${skip.reason})`,
    );
  }
  if (result.conflicts.length > 0) {
    opts.log(
      `[store-sync] sync completed with ${result.conflicts.length} write conflicts`,
    );
  }
  const cap = opts.maxHydrateBytes ?? DEFAULT_MAX_HYDRATE_BYTES;
  if (result.totalBytes > cap * 0.8) {
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    opts.log(
      `[store-sync] agent data is ${mb(result.totalBytes)} MiB of the ` +
        `${mb(cap)} MiB hydration cap — past the cap the agent cannot wake`,
    );
  }
}
