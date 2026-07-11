/**
 * Injected capability ports for the Houston SDK.
 *
 * The SDK is deployment-agnostic: it never reaches for a global (`fetch`,
 * `localStorage`, `Date.now`, `console`) directly. Every side-effecting
 * capability arrives through {@link SdkPorts}, so the SAME kernel runs
 * unchanged in a browser, a React Native bridge, an SSR worker, or a test —
 * the host wires the concrete implementations.
 *
 * Nothing here imports `node:*`; the SDK is browser-safe.
 */

/**
 * A minimal string-keyed persistent store (e.g. `localStorage`, SecureStore,
 * an in-memory map in tests). Async so native/keychain-backed implementations
 * fit without adaptation. Values are opaque strings — callers serialize.
 */
export interface KeyValueStore {
  /** Resolve the stored value for `key`, or `null` when absent. */
  get(key: string): Promise<string | null>;
  /** Store `value` under `key`, overwriting any existing value. */
  set(key: string, value: string): Promise<void>;
  /** Remove `key`. A no-op when the key is absent. */
  delete(key: string): Promise<void>;
}

/**
 * The SDK's sense of time and scheduling. Abstracted so tests can drive timers
 * deterministically and native hosts can supply their own timer primitives.
 * Timer ids are plain numbers to stay portable across DOM/native runtimes.
 */
export interface Clock {
  /** Current wall-clock time in milliseconds since the Unix epoch. */
  now(): number;
  /** Schedule `fn` to run after `ms` milliseconds; returns a cancellation id. */
  setTimeout(fn: () => void, ms: number): number;
  /** Cancel a timer previously scheduled with {@link setTimeout}. */
  clearTimeout(id: number): void;
}

/** Structured fields attached to a log line. Must be JSON-serializable. */
export type LogFields = Record<string, unknown>;

/**
 * Leveled structured logger. The SDK emits diagnostics through this port
 * instead of `console` so hosts can route logs (Sentry, native log, silence
 * in tests) without the kernel knowing.
 */
export interface SdkLogger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/**
 * The full set of capabilities the SDK depends on. The host constructs these
 * once and hands them to {@link SdkConfig}. `fetch` matches the platform
 * `fetch` signature exactly so the runtime-client can be driven by it.
 */
export interface SdkPorts {
  /** HTTP transport, shaped exactly like the global `fetch`. */
  fetch: typeof fetch;
  /** Persistent key/value storage. */
  storage: KeyValueStore;
  /** Time + scheduling. */
  clock: Clock;
  /** Structured logging sink. */
  logger: SdkLogger;
}

/**
 * Everything needed to construct a `HoustonSdk`: where the engine lives and
 * the capability ports to reach it.
 */
export interface SdkConfig {
  /** Base URL of the Houston engine/host, e.g. `"http://127.0.0.1:4317"`. */
  baseUrl: string;
  /** Injected capabilities. */
  ports: SdkPorts;
  /**
   * Max conversations whose folded transcripts are retained in memory at once
   * (the reactive `conversation/<id>` VM cache). Settled, un-viewed
   * conversations past this bound are evicted and re-hydrated from history on
   * re-open. Defaults to `DEFAULT_CONVERSATION_CACHE_MAX`; raise it for a client
   * that keeps many chats hot, lower it under tight memory.
   */
  conversationCacheMax?: number;
  /**
   * Whether the reactive modules (agents, activities) open their own long-lived
   * `GET /v1/events` streams at construction to keep their scope snapshots live.
   *
   * Default `true` — the native/desktop path, where the SDK is the single
   * source of truth for reads. A host that owns its OWN read model and cache
   * invalidation — the web engine-adapter keeps TanStack Query plus its existing
   * `/v1/events` bus — sets this `false` to get a WRITE-ONLY SDK: the same
   * command/mutation handlers, but no module-started streams, so no duplicate
   * subscriptions or refetches. With reactivity off, `getSnapshot`/`subscribe`
   * for those scopes stay empty (the host reads its own model instead).
   */
  reactivity?: boolean;
}
