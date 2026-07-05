/**
 * The bridge KeyValueStore port: `get`/`set`/`delete` performed by the host's
 * native store (Keychain, SecureStore, SharedPreferences) over the pipe.
 *
 * A call leaves as `storage/get|set|delete { id, key, value? }` and the host
 * replies once with `storage/result { id, value? }` — `value` (string | null)
 * for a `get`, omitted for `set`/`delete`. Correlation is by the SDK-minted
 * `id`. This backs `SdkPorts.storage`, which the session module uses to persist
 * the auth token, so the host controls where the token lives.
 */

import type { KeyValueStore } from "../ports";
import type { SendFn } from "./wire";

interface Waiter {
  resolve: (value: string | null) => void;
  reject: (error: unknown) => void;
}

/** The storage half of the port host: owns in-flight ops + routes replies. */
export class StoragePort {
  private readonly pending = new Map<string, Waiter>();

  constructor(
    private readonly send: SendFn,
    private readonly mintId: () => string,
  ) {}

  /** A {@link KeyValueStore} routed over the pipe. */
  readonly store: KeyValueStore = {
    get: (key) => this.request({ kind: "storage/get", key }),
    set: async (key, value) => {
      await this.request({ kind: "storage/set", key, value });
    },
    delete: async (key) => {
      await this.request({ kind: "storage/delete", key });
    },
  };

  private request(frame: Record<string, unknown>): Promise<string | null> {
    const id = this.mintId();
    return new Promise<string | null>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(JSON.stringify({ ...frame, id }));
    });
  }

  /** Route a `storage/result` reply frame. Returns whether it was one. */
  handle(msg: Record<string, unknown>): boolean {
    if (msg.kind !== "storage/result") return false;
    const id = typeof msg.id === "string" ? msg.id : "";
    const waiter = this.pending.get(id);
    if (!waiter) return true;
    this.pending.delete(id);
    waiter.resolve(typeof msg.value === "string" ? msg.value : null);
    return true;
  }

  /** Reject every in-flight op (SDK teardown). */
  dispose(): void {
    for (const waiter of this.pending.values()) {
      waiter.reject(new Error("bridge disposed"));
    }
    this.pending.clear();
  }
}
