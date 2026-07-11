/**
 * The integrations module's no-refetch writes + the gateway session/notice ops
 * a host needs that have no refetching facade sibling.
 *
 * `writes.disconnect` is the {@link IntegrationsModule.disconnect} write WITHOUT
 * the post-write `refresh()` — for a host that owns its own read model (the web
 * engine-adapter under `reactivity:false`). `setSession` and
 * `dismissReconnectNotice` are new user-scoped gateway calls (no prior SDK
 * equivalent). Every call routes through the shared `run` wrapper so a 401 still
 * surfaces as the SDK's `session/tokenExpired` signal.
 *
 * Kept out of `index.ts` so the module factory there stays within the file-size
 * budget; the refetching facade methods there are untouched (iOS-safe).
 */

import type { IntegrationsClient } from "@houston/runtime-client";

/** No-refetch integration writes for a host that owns its own reads. */
export interface IntegrationsWrites {
  /** Disconnect a toolkit for the user everywhere; no refetch. `opts.provider`
   *  defaults to composio (the only provider today). */
  disconnect(toolkit: string, opts?: { provider?: string }): Promise<void>;
}

/** The session/notice ops plus the {@link IntegrationsWrites} namespace. */
export interface IntegrationsWriteOps {
  /** Push the caller's Supabase token to the gateway adapter (`null` on sign-out).
   *  Errors propagate (a 404 = no session sink is the CALLER's call to ignore). */
  setSession(token: string | null): Promise<void>;
  /** Dismiss the one-time "reconnect your integrations" notice (idempotent). */
  dismissReconnectNotice(): Promise<void>;
  /** No-refetch write variants for a host that owns its own reads. */
  writes: IntegrationsWrites;
}

export function createIntegrationsWrites(
  client: IntegrationsClient,
  run: <T>(fn: () => Promise<T>) => Promise<T>,
): IntegrationsWriteOps {
  return {
    setSession: (token) => run(() => client.setSession(token)),
    dismissReconnectNotice: () => run(() => client.dismissReconnectNotice()),
    writes: {
      disconnect: (toolkit, opts) =>
        run(() => client.disconnect(toolkit, opts)),
    },
  };
}
