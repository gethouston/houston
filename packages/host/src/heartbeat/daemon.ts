import type { HeartbeatRunner } from "./runner";

/** How often the daemon asks whether the morning briefing is due. */
export const HEARTBEAT_TICK_MS = 60_000;

/**
 * The minute tick behind the morning briefing. All the deciding is the
 * runner's; this only keeps asking, and never lets a failed attempt go
 * unlogged or stop the next one.
 */
export class HeartbeatDaemon {
  private timer: ReturnType<typeof setInterval> | undefined;
  /** An attempt still running (a slow runtime spawn): the minute tick skips
   *  rather than queueing another attempt behind it every minute. */
  private inFlight = false;

  constructor(
    private readonly runner: HeartbeatRunner,
    private readonly log: (message: string, err?: unknown) => void,
    private readonly intervalMs = HEARTBEAT_TICK_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.inFlight) return;
      this.inFlight = true;
      void this.runner
        .tick()
        .catch((err) => this.log("[heartbeat] tick failed:", err))
        .finally(() => {
          this.inFlight = false;
        });
    }, this.intervalMs);
    // The daemon must not keep the process alive on its own.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
