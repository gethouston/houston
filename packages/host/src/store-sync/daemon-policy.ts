import {
  type HydrateManifest,
  type LeaseHolderState,
  type LocalWriteLock,
  type ObjectStore,
  STORE_ROOT_PACKAGE_EXCLUDES,
  type SyncResult,
  syncBack,
  type WriteLeaseVerdict,
} from "@houston/runtime-client/object-sync";
import { type TreeWatch, watchTree } from "../watch/watch-tree";

export const DEFAULT_QUIET_MS = 3_000;
export const DEFAULT_INTERVAL_MS = 300_000;
export const DEFAULT_MAX_HYDRATE_BYTES = 9 * 1024 * 1024 * 1024;

export const STORE_SYNC_EXCLUDES = [
  "credentials.json",
  "claude-login/.credentials.json",
  "db/",
  "shared-mirror/",
  "upload-staging/",
  ...STORE_ROOT_PACKAGE_EXCLUDES,
  "**/node_modules/",
  "**/.pnpm-store/",
  "**/.venv/",
  "**/venv/",
  "**/__pycache__/",
  "**/.cache/",
  "**/ms-playwright/",
  "**/Cache/",
  "**/Code Cache/",
  "**/GPUCache/",
];

export interface StoreSyncOptions {
  store: ObjectStore;
  rootDir: string;
  excludes?: string[];
  watchExcludeDirs?: string[];
  quietMs?: number;
  intervalMs?: number;
  maxHydrateBytes?: number;
  generations?: boolean;
  finalSyncRetryDelaysMs?: number[];
  localWriteLock?: LocalWriteLock;
  leaseProbe?: () => Promise<WriteLeaseVerdict>;
  leaseClaimed?: () => boolean;
  leaseHeartbeatMs?: number;
  onFenceLost?: (holder: LeaseHolderState) => void;
  log: (msg: string, err?: unknown) => void;
}

export function runSyncBack(
  opts: StoreSyncOptions,
  manifest: HydrateManifest,
  excludes: string[],
): Promise<SyncResult> {
  return syncBack(opts.store, "", opts.rootDir, manifest, {
    excludes,
    generations: opts.generations,
    ...(opts.localWriteLock ? { localWriteLock: opts.localWriteLock } : {}),
  });
}

export function startTreeWatch(
  opts: StoreSyncOptions,
  onDirty: () => void,
): TreeWatch | undefined {
  try {
    return watchTree(opts.rootDir, onDirty, {
      excludeDirs: opts.watchExcludeDirs,
      onError: (err) =>
        opts.log(
          "[store-sync] filesystem watcher degraded; periodic sync covers changes",
          err,
        ),
    });
  } catch (err) {
    opts.log(
      "[store-sync] filesystem watcher failed; using periodic sync",
      err,
    );
    return undefined;
  }
}

export async function awaitInFlightSync(
  opts: StoreSyncOptions,
  pending: Promise<void>,
): Promise<void> {
  try {
    await pending;
  } catch (err) {
    opts.log("[store-sync] in-flight sync failed during shutdown", err);
  }
}

export const FINAL_SYNC_RETRY_DELAYS_MS = [1_000, 4_000];

export async function runFinalSync(
  opts: StoreSyncOptions,
  syncOnce: () => Promise<void>,
): Promise<void> {
  const delays = opts.finalSyncRetryDelaysMs ?? FINAL_SYNC_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await syncOnce();
    } catch (err) {
      if (attempt >= delays.length) {
        opts.log(
          "[store-sync] FINAL sync failed; local changes may be lost",
          err,
        );
        return;
      }
      opts.log(
        `[store-sync] FINAL sync failed; retrying (${err instanceof Error ? err.message : String(err)})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
