import type {
  LeaseHolderState,
  WriteLeaseVerdict,
} from "@houston/runtime-client/object-sync";

export const DEFAULT_LEASE_HEARTBEAT_MS = 60_000;

export interface WriteFenceOptions {
  probe?: () => Promise<WriteLeaseVerdict>;
  claimed?: () => boolean;
  heartbeatMs?: number;
  onLost: (err: { message: string }) => void;
  onHolder: (holder: LeaseHolderState) => void;
  log: (message: string, err?: unknown) => void;
}

export class WriteFence {
  private lostLatch = false;
  private holder: LeaseHolderState | undefined;
  private unsupportedLogged = false;
  private inFlight: Promise<WriteLeaseVerdict | undefined> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private heartbeatWanted = false;

  constructor(private readonly opts: WriteFenceOptions) {}

  private get claimed(): boolean {
    return this.opts.claimed?.() ?? true;
  }

  get lost(): boolean {
    return this.lostLatch;
  }

  lose(err: { message: string }, holder?: LeaseHolderState): void {
    if (this.lostLatch) return;
    this.lostLatch = true;
    this.opts.onLost(err);
    if (holder) this.settle(holder);
    else if (!this.opts.probe) this.settle("stale");
    else void this.watch();
  }

  async writable(): Promise<boolean> {
    if (this.lostLatch) return false;
    if (!this.claimed) return true;
    const verdict = await this.ask();
    if (verdict?.state === "fenced") {
      this.lose(
        { message: "the store's write lease check answered 409" },
        verdict.holder,
      );
    }
    return !this.lostLatch;
  }

  startHeartbeat(): void {
    this.heartbeatWanted = true;
    this.armHeartbeat();
  }

  private armHeartbeat(): void {
    if (!this.heartbeatWanted || !this.opts.probe || this.heartbeat) return;
    if (this.holder === "stale") return;
    this.heartbeat = setInterval(
      () => void (this.lostLatch ? this.watch() : this.writable()),
      this.opts.heartbeatMs ?? DEFAULT_LEASE_HEARTBEAT_MS,
    );
    this.heartbeat.unref?.();
  }

  stopHeartbeat(): void {
    this.heartbeatWanted = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private async watch(): Promise<void> {
    if (this.holder === "stale") return;
    if (this.inFlight) await this.inFlight;
    const verdict = await this.ask();
    if (verdict?.state === "fenced") this.settle(verdict.holder);
    else if (verdict?.state === "held") this.settle("stale");
  }

  private settle(holder: LeaseHolderState): void {
    if (this.holder === "stale" || this.holder === holder) return;
    this.holder = holder;
    if (holder === "stale") this.stopHeartbeat();
    this.opts.onHolder(holder);
  }

  private ask(): Promise<WriteLeaseVerdict | undefined> {
    const probe = this.opts.probe;
    if (!probe) return Promise.resolve({ state: "held" });
    this.inFlight ??= probe()
      .then((verdict) => {
        if (verdict.state === "unsupported" && !this.unsupportedLogged) {
          this.unsupportedLogged = true;
          this.opts.log(
            "[store-sync] the store has no write lease check; a takeover is caught by the sync's own 409",
          );
        }
        return verdict;
      })
      .catch((err: unknown) => {
        this.opts.log(
          `[store-sync] write lease check failed; accepting the write (${err instanceof Error ? err.message : String(err)})`,
        );
        return undefined;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }
}
