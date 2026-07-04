/**
 * Assembles {@link SdkPorts} for a bridged session and routes the host's port
 * replies back to the ports that issued the requests.
 *
 * - **fetch** and **storage** are native, backed by {@link FetchPort} /
 *   {@link StoragePort} over the pipe. `fetch` is wrapped with the SDK's own
 *   {@link createAuthFetch} exactly as the documented host wiring prescribes, so
 *   the session token is stamped per request and 401s are classified.
 * - **clock** is NOT bridged. It reads the JS engine's own `setTimeout` /
 *   `clearTimeout` / `Date.now` — the host already polyfills the global timers
 *   against its native run loop, and the resume/backoff loops in
 *   `@houston/runtime-client` schedule against those globals directly. Bridging
 *   the clock would add a message round-trip to every backoff tick and watchdog
 *   sweep for no benefit, so timers stay in-engine.
 * - **logger** forwards each line outbound as a `log` message.
 */

import { createAuthFetch } from "../modules/session/auth-fetch";
import type { Clock, KeyValueStore, SdkLogger, SdkPorts } from "../ports";
import { FetchPort } from "./fetch";
import { StoragePort } from "./storage";
import type { BridgeLogLevel, NativePorts, SendFn } from "./wire";

/** An in-memory {@link KeyValueStore} for a host that does not back storage. */
function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
  };
}

/** The engine-local clock: global timers + wall clock, never bridged. */
function localClock(): Clock {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  };
}

/** Owns the native port machinery for one bridge and mints their request ids. */
export class PortHost {
  private counter = 0;
  private readonly fetchPort: FetchPort;
  private readonly storagePort: StoragePort;

  constructor(private readonly send: SendFn) {
    this.fetchPort = new FetchPort(send, () => `f${++this.counter}`);
    this.storagePort = new StoragePort(send, () => `k${++this.counter}`);
  }

  /** Build the `SdkPorts` for a configured session. */
  ports(native?: NativePorts): SdkPorts {
    const storage =
      native?.storage === false ? memoryStore() : this.storagePort.store;
    return {
      fetch: createAuthFetch(this.fetchPort.fetch, storage),
      storage,
      clock: localClock(),
      logger: this.logger(),
    };
  }

  /** Route an inbound `fetch/*` or `storage/*` reply. */
  handle(msg: Record<string, unknown>): boolean {
    return this.fetchPort.handle(msg) || this.storagePort.handle(msg);
  }

  /** Fail every in-flight fetch/storage op (SDK teardown). */
  dispose(): void {
    this.fetchPort.dispose();
    this.storagePort.dispose();
  }

  private logger(): SdkLogger {
    const at =
      (level: BridgeLogLevel) =>
      (message: string, fields?: Record<string, unknown>): void =>
        this.send(
          JSON.stringify({
            kind: "log",
            level,
            message,
            ...(fields ? { fields } : {}),
          }),
        );
    return {
      debug: at("debug"),
      info: at("info"),
      warn: at("warn"),
      error: at("error"),
    };
  }
}
