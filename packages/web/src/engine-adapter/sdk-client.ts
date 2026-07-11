/**
 * The web engine-adapter's single {@link HoustonSdk} construction point
 * (migration wave 1).
 *
 * Houston's behavior — agents/activities/providers/integrations/preferences
 * CRUD, turn lifecycle, reconnection — is written ONCE in `@houston/sdk` and
 * every surface binds to it (the iOS app already consumes ALL of it via the
 * native bridge). The web adapter still RE-implements the control-plane CRUD in
 * `control-plane.ts` + `client.ts` against the same routes — a dual source of
 * truth this migration removes. This file builds the ONE web-side `HoustonSdk`
 * that later waves delegate those writes to, so web matches iOS.
 *
 * **Wave 1 is the inert seam.** Construction opens NO network: the SDK is built
 * with `reactivity: false`, so its agents/activities modules do NOT start their
 * `/v1/events` streams — web keeps its own read model (TanStack Query) and its
 * own `/v1/events` bus (`client.ts subscribeServerEvents`) unchanged. The SDK
 * exposes only its WRITE surface for wave 2 (`sdk.agents/activities/providers/
 * integrations/preferences` mutations, which hit the SAME gateway routes).
 *
 * **One source of truth for auth + active space.** The `fetch` handed in is the
 * SAME `gatewayAuthFetch` the adapter's own engine client uses: it reads the
 * live Supabase bearer per attempt, retries a 401 after one refresh, and stamps
 * `x-houston-org` from the live `ControlPlaneConfig.activeOrgSlug`. Sharing that
 * one fetch means `HoustonClient.setActiveOrg` (which mutates the config in
 * place) reroutes the SDK's calls too, with no extra threading.
 */

import { HoustonSdk, type KeyValueStore, type SdkLogger } from "@houston/sdk";

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
   * engine client runs on, carrying the live bearer, 401-refresh, and the
   * `x-houston-org` header off the live active space. Passing the same instance
   * keeps auth + active-space behavior identical across the adapter and the SDK.
   */
  fetch: typeof fetch;
}

/**
 * Construct the web engine-adapter's single, INERT {@link HoustonSdk}: wired to
 * the shared gateway auth fetch, with reactivity OFF (no `/v1/events` streams,
 * no refetch-on-construct) so it changes nothing at runtime until a later wave
 * delegates a write to `sdk.agents/activities/providers/integrations/
 * preferences`. Constructing it issues NO network request.
 */
export function createEngineSdk(opts: EngineSdkOptions): HoustonSdk {
  return new HoustonSdk({
    baseUrl: opts.baseUrl.replace(/\/+$/, ""),
    reactivity: false,
    ports: {
      fetch: opts.fetch,
      storage: createWebStorage(),
      clock: {
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
        clearTimeout: (id) => clearTimeout(id),
      },
      logger: webLogger,
    },
  });
}
