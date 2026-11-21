import type { HeartbeatRunner } from "./runner";

export const HEARTBEAT_TICK_MS = 60_000;

export class HeartbeatDaemon {
  private timer: ReturnType<typeof setInterval> | undefined;
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
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
