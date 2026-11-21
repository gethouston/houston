import type { TreeWatch } from "../watch/watch-tree";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_QUIET_MS,
  type StoreSyncOptions,
  startTreeWatch,
} from "./daemon-policy";

export class SyncSchedule {
  private watcher: TreeWatch | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly opts: StoreSyncOptions) {}

  start(onChange: () => void, onPeriodic: () => void): void {
    this.watcher = startTreeWatch(this.opts, onChange);
    this.intervalTimer = setInterval(
      onPeriodic,
      this.opts.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.intervalTimer.unref?.();
  }

  debounce(pass: () => void): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(pass, this.opts.quietMs ?? DEFAULT_QUIET_MS);
    this.quietTimer.unref?.();
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.quietTimer) clearTimeout(this.quietTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.quietTimer = undefined;
    this.intervalTimer = undefined;
  }
}
