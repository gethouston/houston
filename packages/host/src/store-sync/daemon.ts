import { type FSWatcher, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  type HydrateManifest,
  hydrate,
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";

const DEFAULT_QUIET_MS = 3_000;
const DEFAULT_INTERVAL_MS = 300_000;
// Just under the pod's 10Gi emptyDir cap (GW_PVC_SIZE), NOT the per-turn
// mode's 512 MiB: syncBack has no ceiling, so anything the agent writes must
// also hydrate back on the next wake — a hydrate cap smaller than what sync
// allows out is a delayed crash-loop (writes succeed today, the wake after
// the next sleep fails forever). The gap below 10Gi leaves room for the
// excluded scratch (tmp files, auth.json) that lives on the emptyDir but
// never syncs.
const DEFAULT_MAX_HYDRATE_BYTES = 9 * 1024 * 1024 * 1024;
// Warn while the agent is WRITING (actionable), not when a later wake fails:
// crossing this fraction of the hydrate cap logs loudly on every sync.
const SIZE_WARN_FRACTION = 0.8;

export const STORE_SYNC_EXCLUDES = [
  "credentials.json",
  "claude-login/.credentials.json",
  "db/",
];

export interface StoreSyncOptions {
  store: ObjectStore;
  rootDir: string;
  excludes?: string[];
  quietMs?: number;
  intervalMs?: number;
  maxHydrateBytes?: number;
  log: (msg: string, err?: unknown) => void;
}

/**
 * Owns the managed pod's local cache lifecycle. Hydration must succeed before
 * observation or synchronization can start; that latch prevents an empty cache
 * from ever being mistaken for authoritative mass deletion.
 */
export class StoreSyncDaemon {
  private manifest: HydrateManifest = new Map();
  private hydrated = false;
  private started = false;
  private stopping = false;
  private dirty = false;
  private dirtyVersion = 0;
  private watcher: FSWatcher | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private syncPromise: Promise<void> | undefined;
  private rerunRequested = false;

  constructor(private readonly opts: StoreSyncOptions) {}

  async hydrate(): Promise<void> {
    this.hydrated = false;
    await mkdir(this.opts.rootDir, { recursive: true });
    const manifest = await hydrate(this.opts.store, "", this.opts.rootDir, {
      excludes: this.excludes,
      maxBytes: this.opts.maxHydrateBytes ?? DEFAULT_MAX_HYDRATE_BYTES,
    });
    this.manifest = manifest;
    this.hydrated = true;
  }

  start(): void {
    if (!this.hydrated) {
      throw new Error("store sync cannot start before successful hydration");
    }
    if (this.started) return;
    this.started = true;
    try {
      this.watcher = watch(this.opts.rootDir, { recursive: true }, () =>
        this.markDirty(),
      );
      this.watcher.on("error", (err) => {
        this.opts.log(
          "[store-sync] filesystem watcher failed; using periodic sync",
          err,
        );
        this.watcher?.close();
        this.watcher = undefined;
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
    this.watcher?.close();
    this.watcher = undefined;
    if (this.quietTimer) clearTimeout(this.quietTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.quietTimer = undefined;
    this.intervalTimer = undefined;
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
    if (this.stopping) return;
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
    if (this.stopping || (trigger === "debounced" && !this.dirty)) return;
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
      } while (this.rerunRequested && !this.stopping);
    })().finally(() => {
      this.syncPromise = undefined;
    });
    return this.syncPromise;
  }

  private async syncOnce(): Promise<void> {
    const version = this.dirtyVersion;
    const result = await syncBack(
      this.opts.store,
      "",
      this.opts.rootDir,
      this.manifest,
      { excludes: this.excludes },
    );
    this.manifest = result.manifest;
    if (version === this.dirtyVersion) this.dirty = false;
    const cap = this.opts.maxHydrateBytes ?? DEFAULT_MAX_HYDRATE_BYTES;
    if (result.totalBytes > cap * SIZE_WARN_FRACTION) {
      const mb = (n: number) => Math.round(n / 1024 / 1024);
      this.opts.log(
        `[store-sync] agent data is ${mb(result.totalBytes)} MiB of the ` +
          `${mb(cap)} MiB hydration cap — past the cap the agent cannot wake`,
      );
    }
  }
}
