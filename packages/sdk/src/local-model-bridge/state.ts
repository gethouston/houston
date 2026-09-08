import type { LocalBridgeSnapshot } from "./types";

export class LocalBridgeState {
  protected snapshot: LocalBridgeSnapshot = {
    status: "disabled",
    journal: null,
  };
  protected listeners = new Set<(state: LocalBridgeSnapshot) => void>();
  getSnapshot = (): LocalBridgeSnapshot => this.snapshot;
  subscribe(listener: (state: LocalBridgeSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }
  protected emit(state: LocalBridgeSnapshot) {
    this.snapshot = Object.freeze(state);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
