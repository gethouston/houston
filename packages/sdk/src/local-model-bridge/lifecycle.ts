import { BridgeDisposedError, cancelledBridgeOperation } from "./errors";
import { observeBridgeJournal } from "./journal";
import { BridgeLifetime } from "./lifetime";
import { discoverBridge } from "./resume";
import {
  bridgeIsRetiring,
  loadScopedBridge,
  markBridgeRetiring,
  retireBridge,
} from "./retirement";
import { LocalBridgeState } from "./state";
import type {
  LocalBridgeConnectInput,
  LocalBridgeNativeEvent,
  LocalBridgeStatus,
  LocalModelBridgePorts,
} from "./types";

export abstract class LocalBridgeLifecycle extends LocalBridgeState {
  protected lifetime: BridgeLifetime;
  protected disposed = false;
  private unsubscribe: () => void;
  constructor(protected readonly ports: LocalModelBridgePorts) {
    super();
    this.lifetime = new BridgeLifetime(ports.report);
    ports.management.identity = Object.freeze({ ...ports.management.identity });
    this.ports = {
      ...ports,
      storage: observeBridgeJournal(ports, (journal) => {
        this.emit({
          ...this.snapshot,
          journal,
          descriptor: journal?.descriptor,
          ...(journal && bridgeIsRetiring(journal)
            ? { status: "disabled", generation: undefined }
            : {}),
        });
      }),
    };
    this.unsubscribe = ports.native.subscribe((event) => this.event(event));
  }
  protected abstract event(event: LocalBridgeNativeEvent): void;
  protected abstract begin(
    input: LocalBridgeConnectInput | undefined,
    retry: boolean,
    external?: AbortSignal,
  ): Promise<void>;
  protected disposedRejection(): Promise<never> {
    return Promise.reject(new BridgeDisposedError());
  }
  async resume(): Promise<void> {
    if (this.disposed) throw new BridgeDisposedError();
    if (["connecting", "online", "reconnecting"].includes(this.snapshot.status))
      return;
    const signal = this.lifetime.abort.signal;
    const resume = await discoverBridge(this.ports, signal);
    if (!resume) return;
    if (resume.kind === "terminal") {
      this.emit({ ...this.snapshot, status: resume.status });
      return;
    }
    if (resume.kind === "disabled" || resume.kind === "reconnect_required") {
      this.emit({ ...this.snapshot, status: resume.kind });
      return;
    }
    return this.begin(
      resume.kind === "migration" ? resume.input : undefined,
      false,
    );
  }
  stop(): Promise<void> {
    return this.stopWithStatus("disabled");
  }
  protected stopWithStatus(status: LocalBridgeStatus): Promise<void> {
    this.lifetime.invalidate();
    this.emit({ ...this.snapshot, status, generation: undefined });
    return this.lifetime.enqueue(() => this.ports.native.stop());
  }
  disconnect() {
    if (this.disposed) return this.disposedRejection();
    this.lifetime.invalidate();
    this.emit({ ...this.snapshot, status: "disabled", generation: undefined });
    const signal = this.lifetime.abort.signal;
    const stopping = this.ports.native.stop();
    void stopping.catch(this.ports.report);
    return this.lifetime.enqueue(async () => {
      const journal = await loadScopedBridge(this.ports);
      const retiring = journal
        ? await markBridgeRetiring(
            this.ports,
            journal,
            journal.phase === "retiring" ? "retiring" : "disconnecting",
          )
        : null;
      await stopping;
      signal.throwIfAborted();
      if (retiring) await retireBridge(this.ports, retiring, signal);
      else await this.ports.management.clearEndpoint(signal);
      this.emit({ status: "disabled", journal: null });
    });
  }
  retire() {
    if (this.disposed) return this.disposedRejection();
    this.lifetime.invalidate();
    this.emit({ ...this.snapshot, status: "disabled", generation: undefined });
    return this.lifetime.enqueue(() => this.finishRetirement());
  }
  replaceEndpoint(save: () => Promise<void>): Promise<void> {
    if (this.disposed) return this.disposedRejection();
    if (this.snapshot.journal?.phase !== "committed")
      this.lifetime.invalidate();
    const epoch = this.lifetime.epoch;
    return this.lifetime.enqueue(async () => {
      if (this.disposed) return cancelledBridgeOperation(true);
      await save();
      if (epoch === this.lifetime.epoch) this.lifetime.invalidate();
      this.emit({
        ...this.snapshot,
        status: "disabled",
        generation: undefined,
      });
      await this.finishRetirement();
    });
  }
  private async finishRetirement() {
    const journal = await loadScopedBridge(this.ports);
    const retiring = journal
      ? await markBridgeRetiring(this.ports, journal, "retiring")
      : null;
    await this.ports.native.stop();
    if (retiring) await retireBridge(this.ports, retiring);
  }
  async dispose() {
    this.disposed = true;
    this.unsubscribe();
    await this.stop();
    this.listeners.clear();
  }
}
