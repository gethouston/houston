/**
 * The web engine-adapter's single {@link HoustonSdk} construction point.
 *
 * Houston's behavior — domain CRUD, turn lifecycle, reconnection — is written
 * ONCE in `@houston/sdk`, and every surface binds it: the adapter's mixins
 * delegate their calls to the modules on the SDK built here, so every caller
 * runs the same code against the same routes.
 *
 * **Reactivity is OFF.** The SDK is built with `reactivity: false`, so its
 * agents/activities/turns modules open no `/v1/events` stream and constructing
 * it issues no request: web owns its own read model (TanStack Query) and its
 * own `/v1/events` bus (`client.ts subscribeServerEvents`), and a second stream
 * would duplicate both.
 *
 * **One source of truth for auth + active space.** The `fetch` handed in is the
 * SAME `gatewayAuthFetch` the adapter's own HoustonClient uses: it reads the
 * live Supabase bearer per attempt, retries a 401 after one refresh, and stamps
 * `x-houston-org` from the live `ControlPlaneConfig.activeOrgSlug`. Sharing that
 * one fetch means `HoustonClient.setActiveOrg` (which mutates the config in
 * place) reroutes the SDK's calls too, with no extra threading.
 */

import { HoustonSdk, type KeyValueStore, type SdkLogger } from "@houston/sdk";
import { createDevicePrefsStore } from "./client/device-prefs";
// The barrel, never `cp/transient-retry` directly: the web suite mocks
// `./control-plane` wholesale and a submodule import would bypass the mock.
import { transientRetryFetch } from "./control-plane";

/** Namespace for every SDK-owned `localStorage` key, so nothing the SDK
 *  persists can collide with the adapter's existing browser state. */
const SDK_STORAGE_PREFIX = "houston.sdk.";

/**
 * A {@link KeyValueStore} over `localStorage`, namespaced under
 * {@link SDK_STORAGE_PREFIX}. Falls back to an in-memory map where
 * `localStorage` is absent or disabled (SSR, private-mode denials, tests) so
 * construction never throws.
 */
function createWebStorage(): KeyValueStore {
  const memory = new Map<string, string>();
  const hasLocal = (() => {
    try {
      return typeof localStorage !== "undefined";
    } catch {
      return false;
    }
  })();
  const key = (k: string) => `${SDK_STORAGE_PREFIX}${k}`;
  return {
    async get(k) {
      if (!hasLocal) return memory.get(k) ?? null;
      try {
        return localStorage.getItem(key(k));
      } catch {
        return memory.get(k) ?? null;
      }
    },
    async set(k, value) {
      memory.set(k, value);
      if (!hasLocal) return;
      try {
        localStorage.setItem(key(k), value);
      } catch {
        /* storage disabled — the in-memory copy still answers this session */
      }
    },
    async delete(k) {
      memory.delete(k);
      if (!hasLocal) return;
      try {
        localStorage.removeItem(key(k));
      } catch {
        /* storage disabled */
      }
    },
  };
}

/** A {@link SdkLogger} that routes to `console`, so nothing is ever swallowed. */
const webLogger: SdkLogger = {
  debug: (msg, fields) => console.debug(`[engine-adapter/sdk] ${msg}`, fields),
  info: (msg, fields) => console.info(`[engine-adapter/sdk] ${msg}`, fields),
  warn: (msg, fields) => console.warn(`[engine-adapter/sdk] ${msg}`, fields),
  error: (msg, fields) => console.error(`[engine-adapter/sdk] ${msg}`, fields),
};

/** Everything {@link createEngineSdk} needs from the host adapter. */
export interface EngineSdkOptions {
  /** The gateway/host base URL the SDK's clients root at (trailing slashes trimmed). */
  baseUrl: string;
  /**
   * The SHARED gateway auth fetch — the exact `typeof fetch` the adapter's own
   * HoustonClient runs on, carrying the live bearer, 401-refresh, and the
   * `x-houston-org` header off the live active space. Passing the same instance
   * keeps auth + active-space behavior identical across the adapter and the SDK.
   * The read retry is added HERE, not by the caller (see {@link createEngineSdk}).
   */
  fetch: typeof fetch;
}

/**
 * Construct the web engine-adapter's single {@link HoustonSdk}: wired to the
 * shared gateway auth fetch, with reactivity OFF (no `/v1/events` streams, no
 * refetch-on-construct) because web owns its read model. Constructing it issues
 * NO network request; the first one is whatever a mixin delegates.
 *
 * The transport is the shared gateway auth fetch UNDER the same read retry
 * `cpFetch` gives every control-plane call (`cp/transient-retry.ts`). Composing
 * it at this ONE construction point, rather than inside each SDK module, is
 * what lets a mixin delegate a READ at all: a GET that meets a rolling deploy
 * or a cold engine pod rides it out on the reason-aware ladder instead of
 * surfacing as a boot-path failure. Only GET/HEAD are retried, so no write is
 * ever replayed and a delegated write is still exactly one request on the wire.
 */
export function createEngineSdk(opts: EngineSdkOptions): HoustonSdk {
  return new HoustonSdk({
    baseUrl: opts.baseUrl.replace(/\/+$/, ""),
    reactivity: false,
    ports: {
      fetch: transientRetryFetch(opts.fetch),
      storage: createWebStorage(),
      // The DEVICE's own preferences, in the layout the adapter has always
      // written (`houston.pref.*`): an SDK module that owns a device preference
      // reads back the value the user picked before it moved into the SDK, and a
      // blocked or full store rejects rather than quietly storing nothing.
      devicePreferences: createDevicePrefsStore(),
      clock: {
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
        clearTimeout: (id) => clearTimeout(id),
      },
      logger: webLogger,
    },
  });
}
