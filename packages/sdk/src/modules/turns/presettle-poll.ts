import type { PresettleVerdict } from "./settle-from-history";
import {
  PRESETTLED_GONE_MAX_POLL_MS,
  PRESETTLED_GONE_MS,
} from "./stream-tuning";

export interface PresettleHost {
  canArm(): boolean;
  check(): Promise<PresettleVerdict>;
  gone(): void;
}

export class PresettlePoll {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private goneSince: number | undefined;
  private delay: number | undefined;

  constructor(
    private readonly ms: number | undefined,
    private readonly host: PresettleHost,
  ) {}

  arm(): void {
    if (this.ms === undefined || this.timer !== undefined) return;
    if (!this.host.canArm()) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.fire();
    }, this.delay ?? this.ms);
  }

  cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.goneSince = undefined;
    this.delay = undefined;
  }

  private async fire(): Promise<void> {
    if (!this.host.canArm()) return;
    const verdict = await this.host.check();
    if (verdict === "settled") return;
    if (verdict === "gone") {
      this.goneSince ??= Date.now();
      if (Date.now() - this.goneSince >= PRESETTLED_GONE_MS) {
        if (this.host.canArm()) this.host.gone();
        return;
      }
      const last = this.delay ?? this.ms ?? PRESETTLED_GONE_MAX_POLL_MS;
      this.delay = Math.min(last * 2, PRESETTLED_GONE_MAX_POLL_MS);
    } else {
      this.goneSince = undefined;
      this.delay = undefined;
    }
    this.arm();
  }
}
