import {
  type HydrateManifest,
  type ObjectStore,
  type SyncResult,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { type TreeWatch, watchTree } from "../watch/watch-tree";

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
  /** Gateway's explicit generation-precondition capability (boot lease). */
  generations?: boolean;
  /** One delay per retry of the shutdown flush; override to speed up tests. */
  finalSyncRetryDelaysMs?: number[];
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
  });
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

/**
 * Watch the tree, degrading to the periodic pass alone when the watcher
 * cannot start or later fails. onError fires at most once (ENOSPC on the
 * pod's inotify budget — HOU-841); the tree watch keeps whatever coverage it
 * already has, and the periodic pass guarantees eventual sync regardless.
 */
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

/** Consecutive failed passes before a sync failure reports with its error.
 *  At the 5-min periodic interval this is ~15 min of sustained failure. */
const REPORT_AFTER_FAILURES = 3;

/**
 * One failed pass is a deploy-window blip the next pass absorbs (the gateway
 * restarts, the pod's network tears down): a breadcrumb, not a report
 * (HOUSTON-APP-58V). A streak means the store is actually unreachable — that
 * reports with the error attached.
 */
export function logSyncFailed(
  opts: StoreSyncOptions,
  trigger: string,
  consecutiveFailures: number,
  err: unknown,
): void {
  if (consecutiveFailures >= REPORT_AFTER_FAILURES) {
    opts.log(
      `[store-sync] ${trigger} sync failed ${consecutiveFailures} times in a row; will retry`,
      err,
    );
    return;
  }
  opts.log(
    `[store-sync] ${trigger} sync failed; will retry (${err instanceof Error ? err.message : String(err)})`,
  );
}

/** One delay per retry of the shutdown flush, so attempts = delays + 1. */
export const FINAL_SYNC_RETRY_DELAYS_MS = [1_000, 4_000];

/**
 * The shutdown flush races the same deploy window that drains the pod (an
 * engine roll restarts the gateway too), and unlike the periodic pass it has
 * no next tick to absorb a blip — sync-back's generation-guarded uploads get
 * exactly one fetch attempt, so a lone `fetch failed` used to abort the whole
 * final sync (HOUSTON-APP-58V). Bounded retries absorb the blip; only
 * exhausting them reports with the error, because at that point recent local
 * changes really may be lost.
 */
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
