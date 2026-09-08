import { savedBridge } from "./connection";
import { BridgeLifetime } from "./lifetime";
import { LocalBridgeState } from "./state";
import type {
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
    this.unsubscribe = ports.native.subscribe((event) => this.event(event));
  }
  protected abstract event(event: LocalBridgeNativeEvent): void;
  stop(): Promise<void> {
    return this.stopWithStatus("disabled");
  }
  protected stopWithStatus(status: LocalBridgeStatus): Promise<void> {
    this.lifetime.invalidate();
    this.emit({ ...this.snapshot, status, generation: undefined });
    return this.lifetime.enqueue(() => this.ports.native.stop());
  }
  disconnect() {
    if (this.disposed)
      return Promise.reject(new Error("bridge controller disposed"));
    this.lifetime.invalidate();
    this.emit({ ...this.snapshot, status: "disabled", generation: undefined });
    return this.lifetime.enqueue(async () => {
      await this.ports.native.stop();
      const journal = await savedBridge(this.ports);
      if (journal?.descriptor)
        await this.ports.management.revoke(journal.descriptor.bridgeId);
      await this.ports.management.clearEndpoint();
      await this.ports.storage.clear(this.ports.management.identity);
      this.emit({ status: "disabled", journal: null });
    });
  }
  retire() {
    if (this.disposed)
      return Promise.reject(new Error("bridge controller disposed"));
    this.lifetime.invalidate();
    this.emit({ ...this.snapshot, status: "disabled", generation: undefined });
    return this.lifetime.enqueue(async () => {
      await this.ports.native.stop();
      const journal = await savedBridge(this.ports);
      await this.ports.storage.clear(this.ports.management.identity);
      this.emit({ status: "disabled", journal: null });
      if (journal?.descriptor)
        await this.ports.management.revoke(journal.descriptor.bridgeId);
    });
  }
  async dispose() {
    this.disposed = true;
    this.unsubscribe();
    await this.stop();
    this.listeners.clear();
  }
}
