import type { LocalBridgeDevice } from "@houston/protocol";
import { cancelPreparedBridge } from "./cancellation";
import { openBridge, renewalDelay, renewBridge } from "./connection";
import { BridgeStateError, cancelledBridgeOperation } from "./errors";
import { LocalBridgeLifecycle } from "./lifecycle";
import { bridgeNeedsWake } from "./resume";
import { bridgeIsRetiring, loadScopedBridge, retireBridge } from "./retirement";
import { bridgeRetry } from "./retry";
import type { LocalBridgeConnectInput, LocalBridgeNativeEvent } from "./types";

export class LocalModelBridgeController extends LocalBridgeLifecycle {
  private attempts = 0;
  private onlineAt?: number;
  private device?: LocalBridgeDevice;
  connect(input: LocalBridgeConnectInput, signal?: AbortSignal): Promise<void> {
    return this.begin(input, false, signal);
  }
  reconnect(): Promise<void> {
    this.attempts = 0;
    return this.begin(undefined, false);
  }
  async wake(): Promise<void> {
    if (this.disposed) throw new Error("bridge controller disposed");
    const status = await bridgeNeedsWake(
      this.ports,
      this.snapshot,
      this.lifetime.abort.signal,
    );
    if (!status) return;
    if (status !== "reconnecting") return this.stopWithStatus(status);
    return this.begin(undefined, true);
  }
  protected begin(
    input: LocalBridgeConnectInput | undefined,
    retry: boolean,
    external?: AbortSignal,
  ) {
    if (this.disposed)
      return Promise.reject(new Error("bridge controller disposed"));
    const epoch = this.lifetime.invalidate();
    const signal = external
      ? AbortSignal.any([external, this.lifetime.abort.signal])
      : this.lifetime.abort.signal;
    return this.lifetime.enqueue(async () => {
      await this.ports.native.stop();
      if (epoch !== this.lifetime.epoch)
        return cancelledBridgeOperation(!!input);
      let retiring = false;
      try {
        const saved = await loadScopedBridge(this.ports);
        signal.throwIfAborted();
        if (saved && (input || bridgeIsRetiring(saved))) {
          retiring = true;
          this.emit({
            status: "disabled",
            journal: saved.phase === "disconnecting" ? saved : null,
          });
          await retireBridge(this.ports, saved, signal);
          this.emit({ status: "disabled", journal: null });
          if (!input) return;
          retiring = false;
        }
        if (!saved && !input) {
          this.emit({ status: "disabled", journal: null });
          return;
        }
        this.emit({
          ...this.snapshot,
          status: retry ? "reconnecting" : "connecting",
          generation: undefined,
        });
        const { journal, device, ready } = await openBridge(
          this.ports,
          signal,
          input,
        );
        signal.throwIfAborted();
        this.device = device;
        this.emit({
          status: "online",
          journal,
          descriptor: journal.descriptor,
          ...ready,
        });
        this.onlineAt = (this.ports.now ?? Date.now)();
        this.armRenewal(epoch);
      } catch (error) {
        await this.ports.native.stop();
        if (signal.aborted && input) await cancelPreparedBridge(this.ports);
        if (epoch !== this.lifetime.epoch)
          return cancelledBridgeOperation(!!input);
        if (signal.aborted) {
          this.emit({ status: "disabled", journal: null });
          return cancelledBridgeOperation(!!input);
        }
        this.failure(error, epoch, retiring);
        if (!retry) throw error;
      }
    });
  }
  private failure(error: unknown, epoch: number, retiring = false) {
    if (
      this.onlineAt !== undefined &&
      (this.ports.now ?? Date.now)() - this.onlineAt >= 60_000
    )
      this.attempts = 0;
    this.onlineAt = undefined;
    this.ports.report(error);
    const { status, delay } = bridgeRetry(
      error,
      this.attempts++,
      this.ports.random ?? Math.random,
    );
    this.emit(
      retiring
        ? { status: "disabled", journal: this.snapshot.journal }
        : { ...this.snapshot, status, generation: undefined },
    );
    if (delay === null) return;
    this.lifetime.timer = setTimeout(() => {
      if (epoch === this.lifetime.epoch)
        void this.begin(undefined, true).catch(this.ports.report);
    }, delay);
  }
  private armRenewal(epoch: number) {
    const expiresAt = this.snapshot.sessionExpiresAt;
    if (!expiresAt) return;
    clearTimeout(this.lifetime.timer);
    this.lifetime.timer = setTimeout(
      () => {
        void this.renew(epoch).catch(this.ports.report);
      },
      renewalDelay(expiresAt, (this.ports.now ?? Date.now)()),
    );
  }
  private renew(epoch: number) {
    return this.lifetime.enqueue(async () => {
      if (
        epoch !== this.lifetime.epoch ||
        !this.device ||
        !this.snapshot.descriptor ||
        this.snapshot.generation === undefined
      )
        return;
      try {
        const expiresAt = await renewBridge(
          this.ports,
          this.snapshot,
          this.device,
          this.lifetime.abort.signal,
        );
        if (epoch !== this.lifetime.epoch) return;
        this.emit({ ...this.snapshot, sessionExpiresAt: expiresAt });
        this.armRenewal(epoch);
      } catch (error) {
        await this.ports.native.stop();
        if (epoch === this.lifetime.epoch) this.failure(error, epoch);
      }
    });
  }
  protected event(event: LocalBridgeNativeEvent) {
    if (
      event.bridgeId !== this.snapshot.descriptor?.bridgeId ||
      event.generation !== this.snapshot.generation ||
      this.snapshot.status === "disabled"
    )
      return;
    if (event.status === "online") return;
    clearTimeout(this.lifetime.timer);
    if (
      event.status === "revoked" ||
      event.status === "authorization_required"
    ) {
      this.lifetime.invalidate();
      this.emit({
        ...this.snapshot,
        status: event.status,
        generation: undefined,
      });
      void this.lifetime
        .enqueue(() => this.ports.native.stop())
        .catch(this.ports.report);
      return;
    }
    this.failure(
      new BridgeStateError(
        event.status === "model_unavailable"
          ? "model_unavailable"
          : "reconnecting",
      ),
      this.lifetime.epoch,
    );
  }
}
