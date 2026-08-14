import { mkdir } from "node:fs/promises";
import {
  type HydrateManifest,
  hydrate,
  StoreFencedError,
} from "@houston/runtime-client/object-sync";
import { type TreeWatch, watchTree } from "../watch/watch-tree";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_MAX_HYDRATE_BYTES,
  DEFAULT_QUIET_MS,
  logHydrated,
  logSyncResult,
  runSyncBack,
  STORE_SYNC_EXCLUDES,
  type StoreSyncOptions,
} from "./daemon-policy";

export { STORE_SYNC_EXCLUDES, type StoreSyncOptions } from "./daemon-policy";

export class StoreSyncDaemon {
  private manifest: HydrateManifest = new Map();
  private hydrated = false;
  private started = false;
  private stopping = false;
  private dirty = false;
  private dirtyVersion = 0;
  private watcher: TreeWatch | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private syncPromise: Promise<void> | undefined;
  private rerunRequested = false;
  private fencedLatch = false;

  constructor(private readonly opts: StoreSyncOptions) {}

  get fenced(): boolean {
    return this.fencedLatch;
  }

  /** Returns the number of objects restored (the boot telemetry records it). */
  async hydrate(): Promise<number> {
    this.hydrated = false;
    const startedAt = Date.now();
    await mkdir(this.opts.rootDir, { recursive: true });
    const manifest = await hydrate(this.opts.store, "", this.opts.rootDir, {
      excludes: this.excludes,
      maxBytes: this.opts.maxHydrateBytes ?? DEFAULT_MAX_HYDRATE_BYTES,
    });
    this.manifest = manifest;
    this.hydrated = true;
    logHydrated(this.opts, manifest.size, startedAt);
    return manifest.size;
  }

  start(): void {
    if (!this.hydrated) {
      throw new Error("store sync cannot start before successful hydration");
    }
    if (this.started || this.fencedLatch) return;
    this.started = true;
    try {
      this.watcher = watchTree(this.opts.rootDir, () => this.markDirty(), {
        excludeDirs: this.opts.watchExcludeDirs,
        // Fires at most once (ENOSPC on the pod's inotify budget — HOU-841);
        // the tree watch keeps whatever coverage it already has, and the
        // periodic pass guarantees eventual sync regardless.
        onError: (err) =>
          this.opts.log(
            "[store-sync] filesystem watcher degraded; periodic sync covers changes",
            err,
          ),
      });
    } catch (err) {
      this.opts.log(
        "[store-sync] filesystem watcher failed; using periodic sync",
        err,
      );
      this.watcher = undefined;
    }
    this.intervalTimer = setInterval(
      () => this.runInBackground("periodic"),
      this.opts.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.intervalTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.stopScheduling();
    if (!this.hydrated) return;

    if (this.syncPromise) {
      try {
        await this.syncPromise;
      } catch (err) {
        this.opts.log(
          "[store-sync] in-flight sync failed during shutdown",
          err,
        );
      }
    }
    if (this.fencedLatch) {
      this.started = false;
      return;
    }
    try {
      await this.syncOnce();
    } catch (err) {
      this.opts.log(
        "[store-sync] FINAL sync failed; local changes may be lost",
        err,
      );
    }
    this.started = false;
  }

  private get excludes(): string[] {
    return this.opts.excludes ?? STORE_SYNC_EXCLUDES;
  }

  private markDirty(): void {
    if (this.stopping || this.fencedLatch) return;
    this.dirty = true;
    this.dirtyVersion += 1;
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(
      () => this.runInBackground("debounced"),
      this.opts.quietMs ?? DEFAULT_QUIET_MS,
    );
    this.quietTimer.unref?.();
  }

  private runInBackground(trigger: string): void {
    if (
      this.stopping ||
      this.fencedLatch ||
      (trigger === "debounced" && !this.dirty)
    )
      return;
    void this.requestSync().catch((err) => {
      this.opts.log(`[store-sync] ${trigger} sync failed; will retry`, err);
    });
  }

  private requestSync(): Promise<void> {
    if (this.syncPromise) {
      this.rerunRequested = true;
      return this.syncPromise;
    }
    this.syncPromise = (async () => {
      do {
        this.rerunRequested = false;
        await this.syncOnce();
      } while (this.rerunRequested && !this.stopping && !this.fencedLatch);
    })().finally(() => {
      this.syncPromise = undefined;
    });
    return this.syncPromise;
  }

  private async syncOnce(): Promise<void> {
    const version = this.dirtyVersion;
    let result: Awaited<ReturnType<typeof runSyncBack>>;
    try {
      result = await runSyncBack(this.opts, this.manifest, this.excludes);
    } catch (err) {
      if (!(err instanceof StoreFencedError)) throw err;
      this.loseFence(err);
      return;
    }
    this.manifest = result.manifest;
    if (version === this.dirtyVersion) this.dirty = false;
    logSyncResult(result, this.opts);
  }

  private loseFence(err: StoreFencedError): void {
    if (this.fencedLatch) return;
    this.fencedLatch = true;
    this.dirty = false;
    this.rerunRequested = false;
    this.stopScheduling();
    this.opts.log(
      "[store-sync] write fencing lost: another pod owns this agent's store; halting sync",
      err,
    );
  }

  private stopScheduling(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.quietTimer) clearTimeout(this.quietTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.quietTimer = undefined;
    this.intervalTimer = undefined;
  }
}
