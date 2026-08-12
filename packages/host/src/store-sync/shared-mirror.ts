import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type ManifestObjectStore,
  probeSharedMirror,
  type SharedMirrorState,
  syncSharedMirror,
} from "@houston/runtime-client/object-sync";
import { type TreeWatch, watchTree } from "../watch/watch-tree";

const DEFAULT_PROBE_DEBOUNCE_MS = 15_000;
const DEFAULT_WATCH_DEBOUNCE_MS = 2_000;

export interface SharedMirrorControllerOptions {
  store: ManifestObjectStore;
  mirrorDir: string;
  debounceMs?: number;
  watchDebounceMs?: number;
  now?: () => number;
  log: (message: string, error?: unknown) => void;
}

/**
 * Owns the two deliberately soft shared-cache refresh points. A single-flight
 * probe updates its baseline only after complete reconciliation, so a failed
 * partial pass is retried safely on a later probe.
 */
export class SharedMirrorController {
  private state: SharedMirrorState | undefined;
  private lastProbeAt: number | undefined;
  private inFlight: Promise<void> | undefined;
  private inFlightMode: "push-pull" | "push-only" | undefined;
  private watcher: TreeWatch | undefined;
  private watchTimer: ReturnType<typeof setTimeout> | undefined;
  private watchDirty = false;
  private needsRetry = false;
  private stopped = false;

  constructor(private readonly options: SharedMirrorControllerOptions) {}

  /** Begin wake hydration without making host readiness wait on remote storage. */
  wake(): void {
    this.ensureWatcher();
    void this.requestSync("wake sync", "push-pull");
  }

  /** Refresh before a turn, joining wake work and debouncing remote probes. */
  beforeTurn(): Promise<void> {
    this.ensureWatcher();
    if (this.inFlight) {
      if (this.inFlightMode === "push-pull") return this.inFlight;
      return this.inFlight.then(() => this.beforeTurn());
    }
    const now = this.now();
    const debounceMs = this.options.debounceMs ?? DEFAULT_PROBE_DEBOUNCE_MS;
    if (
      !this.needsRetry &&
      this.lastProbeAt !== undefined &&
      now - this.lastProbeAt < debounceMs
    ) {
      return Promise.resolve();
    }
    return this.requestSync("turn-start probe", "push-pull");
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.watcher?.close();
    this.watcher = undefined;
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = undefined;
    await this.inFlight;
    if (this.state) {
      await this.requestSync("shutdown push", "push-only");
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private ensureWatcher(): void {
    if (this.stopped || this.watcher) return;
    try {
      const skillsDir = join(this.options.mirrorDir, "skills");
      mkdirSync(skillsDir, { recursive: true });
      this.watcher = watchTree(skillsDir, () => this.markWatchDirty(), {
        onError: (error) => {
          this.watcher?.close();
          this.watcher = undefined;
          this.options.log(
            "[shared-mirror] filesystem watcher failed; changes retry on the next sync",
            error,
          );
        },
      });
    } catch (error) {
      this.options.log(
        "[shared-mirror] filesystem watcher failed; changes retry on the next sync",
        error,
      );
    }
  }

  private markWatchDirty(): void {
    if (this.stopped) return;
    this.watchDirty = true;
    if (this.inFlight) return;
    this.scheduleWatchPush();
  }

  private scheduleWatchPush(): void {
    if (this.stopped || !this.watchDirty) return;
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = undefined;
      this.watchDirty = false;
      void this.requestSync("watcher push", "push-only");
    }, this.options.watchDebounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS);
    this.watchTimer.unref?.();
  }

  private requestSync(
    trigger: string,
    mode: "push-pull" | "push-only",
  ): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (mode === "push-pull") this.lastProbeAt = this.now();
    this.inFlightMode = mode;
    this.inFlight = probeSharedMirror(this.options.store)
      .then(async (snapshot) => {
        const result = await syncSharedMirror({
          store: this.options.store,
          mirrorDir: this.options.mirrorDir,
          snapshot,
          state: this.state,
          mode,
          onConflict: (key) =>
            this.options.log(
              `[shared-mirror] concurrent change blocked local edit for ${key}`,
            ),
        });
        this.state = result.state;
        if (mode === "push-pull") {
          this.needsRetry = false;
          this.watcher?.close();
          this.watcher = undefined;
          this.ensureWatcher();
        }
      })
      .catch((error) => {
        this.needsRetry = true;
        this.options.log(
          `[shared-mirror] ${trigger} failed; using current mirror`,
          error,
        );
      })
      .finally(() => {
        this.inFlight = undefined;
        this.inFlightMode = undefined;
        this.scheduleWatchPush();
      });
    return this.inFlight;
  }
}
