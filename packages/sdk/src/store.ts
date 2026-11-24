/**
 * A fire-and-forget notification broadcast on the global event channel,
 * distinct from a scope snapshot. Used for one-shot signals (toasts, errors,
 * lifecycle) that are not themselves reactive state. JSON-serializable.
 */
export interface SdkEvent {
  /** Discriminator, e.g. `"connection/error"`, `"turn/started"`. */
  type: string;
  /** Optional scope the event relates to. */
  scope?: string;
  /** Optional JSON payload. */
  data?: unknown;
}

/** A subscriber to a single scope's snapshots. */
export type SnapshotListener = (snapshot: unknown) => void;
/** A subscriber to the global event channel. */
export type EventListener = (event: SdkEvent) => void;

/**
 * Holds the latest snapshot per scope and fans out changes to subscribers.
 *
 * **Re-entrancy safety.** `publish` and `emitEvent` iterate over a *copy* of
 * the current listener set, so a callback may freely `subscribe`/unsubscribe
 * (including unsubscribing itself) mid-notification without corrupting the
 * iteration. A listener removed during a `publish` is not observed on the
 * *next* publish; whether it still receives the in-flight notification is
 * unspecified (it is iterating a snapshot taken before it was removed).
 *
 * **Listener isolation.** A throwing listener never reaches the publisher or
 * its sibling listeners: the snapshot is already stored, every other listener
 * still runs, and the error is rethrown on its own microtask so it surfaces on
 * the host's uncaught-error path (log + Sentry) instead of aborting the turn
 * machinery mid-frame. A UI binding's failure is never the data flow's.
 */
export class ScopeStore {
  private readonly snapshots = new Map<string, unknown>();
  private readonly subscribers = new Map<string, Set<SnapshotListener>>();
  private readonly eventListeners = new Set<EventListener>();

  /** Return the latest snapshot for `scope`, or `undefined` if none published. */
  getSnapshot(scope: string): unknown | undefined {
    return this.snapshots.get(scope);
  }

  /** Whether any listener is currently subscribed to `scope`. */
  hasSubscribers(scope: string): boolean {
    return (this.subscribers.get(scope)?.size ?? 0) > 0;
  }

  /**
   * Drop the retained snapshot for `scope`, freeing the memory it held. Used
   * when a scope's owner evicts/forgets its state (a bounded cache dropping an
   * idle conversation): the snapshot is a full copy of that state, so evicting
   * the source without clearing here would leak the larger half. Notifies
   * nobody — callers only clear a scope with no live subscribers, and the next
   * `publish` (a re-seed from authoritative history) restores it.
   */
  clear(scope: string): void {
    this.snapshots.delete(scope);
  }

  /**
   * Store `snapshot` as the latest value for `scope` and synchronously notify
   * every current subscriber of that scope.
   */
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

  /**
   * Subscribe `cb` to `scope`'s snapshots. Returns an idempotent unsubscribe
   * function; calling it more than once is safe. Note: subscribing does NOT
   * immediately deliver the current snapshot — read it with `getSnapshot` if
   * you need the initial value.
   */
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

  /** Broadcast `event` to every global event listener. */
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

  /**
   * Subscribe `cb` to the global event channel. Returns an idempotent
   * unsubscribe function.
   */
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
