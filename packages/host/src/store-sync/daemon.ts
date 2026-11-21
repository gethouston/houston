import { StoreFencedError } from "@houston/runtime-client/object-sync";
import { CoalescedRun } from "./coalesced-run";
import { createDaemonFence } from "./daemon-fence";
import { FENCE_RETIRED_MARKER } from "./daemon-hydrate";
import { logFenceLost, logSyncFailed, logSyncResult } from "./daemon-log";
import {
  awaitInFlightSync,
  runFinalSync,
  STORE_SYNC_EXCLUDES,
  type StoreSyncOptions,
} from "./daemon-policy";
import { SyncSchedule } from "./sync-schedule";
import { SyncedUploadFiles } from "./upload-files";
import type { WriteFence } from "./write-fence";

export { STORE_SYNC_EXCLUDES, type StoreSyncOptions } from "./daemon-policy";

export class StoreSyncDaemon {
  private readonly files: SyncedUploadFiles;
  private hydrated = false;
  private started = false;
  private stopping = false;
  private dirty = false;
  private dirtyVersion = 0;
  private readonly schedule: SyncSchedule;
  private readonly fence: WriteFence;
  private readonly syncs = new CoalescedRun(
    () => this.syncOnce(),
    () => !this.stopping && !this.fence.lost,
  );
  private consecutiveFailures = 0;

  constructor(private readonly opts: StoreSyncOptions) {
    this.files = new SyncedUploadFiles(opts);
    this.schedule = new SyncSchedule(opts);
    this.fence = createDaemonFence(
      opts,
      (err) => this.haltFenced(err),
      () => this.files.manifest.keys(),
    );
  }

  get uploadStore() {
    return this.files.uploadStore;
  }

  copyUpload(id: string, key: string, generation: string): Promise<void> {
    return this.files.copyUpload(id, key, generation);
  }

  get fenced(): boolean {
    return this.fence.lost;
  }

  writable(): Promise<boolean> {
    return this.fence.writable();
  }

  get rootDir(): string {
    return this.opts.rootDir;
  }

  async hydrate(): Promise<number> {
    this.hydrated = false;
    this.fence.startHeartbeat();
    const count = await this.files.hydrate(this.excludes);
    this.hydrated = true;
    return count;
  }

  start(): void {
    if (!this.hydrated) {
      throw new Error("store sync cannot start before successful hydration");
    }
    if (this.started || this.fence.lost) return;
    this.started = true;
    this.fence.startHeartbeat();
    this.schedule.start(
      () => this.markDirty(),
      () => this.runInBackground("periodic"),
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.fence.stopHeartbeat();
    this.schedule.stop();
    if (!this.hydrated) return;

    const inFlight = this.syncs.inFlight;
    if (inFlight) await awaitInFlightSync(this.opts, inFlight);
    if (this.fence.lost) {
      this.started = false;
      return;
    }
    await runFinalSync(this.opts, () => this.syncOnce());
    this.started = false;
  }

  private get excludes(): string[] {
    return [
      ...(this.opts.excludes ?? STORE_SYNC_EXCLUDES),
      FENCE_RETIRED_MARKER,
    ];
  }

  private markDirty(): void {
    if (this.stopping || this.fence.lost) return;
    this.dirty = true;
    this.dirtyVersion += 1;
    this.schedule.debounce(() => this.runInBackground("debounced"));
  }

  async flush(): Promise<void> {
    if (this.markForSync()) await this.syncs.request();
  }

  syncAfterWrite(): void {
    if ((this.opts.leaseClaimed?.() ?? true) && this.markForSync()) {
      this.runInBackground("write");
    }
  }

  private markForSync(): boolean {
    if (!this.started || this.stopping || this.fence.lost) return false;
    this.dirty = true;
    this.dirtyVersion += 1;
    return true;
  }

  private runInBackground(trigger: string): void {
    if (
      this.stopping ||
      this.fence.lost ||
      (trigger === "debounced" && !this.dirty)
    )
      return;
    void this.syncs.request().catch((err) => {
      logSyncFailed(this.opts, trigger, this.consecutiveFailures, err);
    });
  }

  private async syncOnce(): Promise<void> {
    const version = this.dirtyVersion;
    let result: Awaited<ReturnType<SyncedUploadFiles["sync"]>>;
    try {
      result = await this.files.sync(this.excludes);
    } catch (err) {
      if (!(err instanceof StoreFencedError)) {
        this.consecutiveFailures += 1;
        throw err;
      }
      this.fence.lose(err);
      return;
    }
    this.consecutiveFailures = 0;
    if (version === this.dirtyVersion) this.dirty = false;
    logSyncResult(result, this.opts);
  }

  private haltFenced(err: { message: string }): void {
    this.dirty = false;
    this.syncs.cancelRerun();
    this.schedule.stop();
    logFenceLost(this.opts, err);
  }
}
