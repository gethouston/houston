/**
 * The reactive core of the SDK: a scope-keyed snapshot store plus a global
 * event channel.
 *
 * **Model — snapshots, not patches.** Every reactive surface is addressed by a
 * string *scope* (`"connection"`, `"agents"`, `"conversation/<id>"`). A module
 * owns a scope and, whenever its state changes, `publish`es the WHOLE new
 * snapshot for that scope. Subscribers receive the complete value — there is no
 * diff/patch protocol to reconcile. Houston's event rates are UI-scale, so the
 * simplicity of "latest wins" beats the bookkeeping of incremental patches (see
 * README "why snapshots-not-patches").
 *
 * Everything crossing `getSnapshot`/`subscribe`/`emitEvent`/`onEvent` is plain
 * JSON — no functions, no class instances — so it can traverse a native bridge
 * or a structured-clone boundary unchanged.
 */

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
 */
export class ScopeStore {
  private readonly snapshots = new Map<string, unknown>();
  private readonly subscribers = new Map<string, Set<SnapshotListener>>();
  private readonly eventListeners = new Set<EventListener>();

  /** Return the latest snapshot for `scope`, or `undefined` if none published. */
  getSnapshot(scope: string): unknown | undefined {
    return this.snapshots.get(scope);
  }

  /**
   * Store `snapshot` as the latest value for `scope` and synchronously notify
   * every current subscriber of that scope.
   */
  publish(scope: string, snapshot: unknown): void {
    this.snapshots.set(scope, snapshot);
    const subs = this.subscribers.get(scope);
    if (!subs || subs.size === 0) return;
    for (const listener of [...subs]) listener(snapshot);
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
    for (const listener of [...this.eventListeners]) listener(event);
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
