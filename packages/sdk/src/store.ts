export interface SdkEvent {
  type: string;
  scope?: string;
  data?: unknown;
}

export type SnapshotListener = (snapshot: unknown) => void;
export type EventListener = (event: SdkEvent) => void;

export class ScopeStore {
  private readonly snapshots = new Map<string, unknown>();
  private readonly subscribers = new Map<string, Set<SnapshotListener>>();
  private readonly eventListeners = new Set<EventListener>();

  getSnapshot(scope: string): unknown | undefined {
    return this.snapshots.get(scope);
  }

  hasSubscribers(scope: string): boolean {
    return (this.subscribers.get(scope)?.size ?? 0) > 0;
  }

  clear(scope: string): void {
    this.snapshots.delete(scope);
  }

  publish(scope: string, snapshot: unknown): void {
    this.snapshots.set(scope, snapshot);
    const subs = this.subscribers.get(scope);
    if (!subs || subs.size === 0) return;
    for (const listener of [...subs]) {
      try {
        listener(snapshot);
      } catch (err) {
        rethrowAsync(err);
      }
    }
  }

  subscribe(scope: string, cb: SnapshotListener): () => void {
    let subs = this.subscribers.get(scope);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(scope, subs);
    }
    subs.add(cb);
    return () => {
      const current = this.subscribers.get(scope);
      if (!current) return;
      current.delete(cb);
      if (current.size === 0) this.subscribers.delete(scope);
    };
  }

  emitEvent(event: SdkEvent): void {
    if (this.eventListeners.size === 0) return;
    for (const listener of [...this.eventListeners]) {
      try {
        listener(event);
      } catch (err) {
        rethrowAsync(err);
      }
    }
  }

  onEvent(cb: EventListener): () => void {
    this.eventListeners.add(cb);
    return () => {
      this.eventListeners.delete(cb);
    };
  }
}

function rethrowAsync(err: unknown): void {
  queueMicrotask(() => {
    throw err;
  });
}
