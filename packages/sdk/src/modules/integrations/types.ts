/**
 * View-model shape, scope key, and command vocabulary for the integrations
 * module — the SDK contract every surface (web, desktop, native) binds to.
 *
 * Everything here is plain JSON (see `store.ts` "snapshots, not patches"): the
 * VM crosses the native bridge unchanged. The wire toolkit/connection shapes are
 * re-exported from `@houston/runtime-client` so a contract change breaks the
 * typecheck here instead of silently drifting.
 */

import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/runtime-client";

export type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/runtime-client";

/** The single scope the integrations VM is published under. */
export const INTEGRATIONS_SCOPE = "integrations";

/**
 * Why integrations are not usable, when `ready` is false:
 *  - `"unavailable"` — the gateway has no Composio key (503); the tab shows the
 *    "not available in this setup" message. Never crashes the tab.
 *  - `"signin"` — the provider reports it needs a Houston sign-in first.
 * A 401 (expired session) is NOT a reason here — it routes through the shared
 * `tokenExpired` signal instead.
 */
export type IntegrationsUnavailableReason = "unavailable" | "signin";

/** Snapshot published under {@link INTEGRATIONS_SCOPE}. */
export interface IntegrationsViewModel {
  /** `true` once a refresh has resolved; `false` while loading / never fetched. */
  loaded: boolean;
  /** Whether integrations are usable (a Composio key is configured + ready). */
  ready: boolean;
  /** Present only when `ready` is false — why. */
  reason?: IntegrationsUnavailableReason;
  /** The connectable-app catalog (empty until ready). */
  toolkits: IntegrationToolkit[];
  /** The user's connected accounts (empty until ready). */
  connections: IntegrationConnection[];
}

/** The write vocabulary — the same constants back the facade and the bridge. */
export const IntegrationsCommand = {
  Refresh: "integrations/refresh",
  Connect: "integrations/connect",
  PollConnection: "integrations/pollConnection",
  Disconnect: "integrations/disconnect",
} as const;

export type IntegrationsCommandType =
  (typeof IntegrationsCommand)[keyof typeof IntegrationsCommand];

/** The empty VM used for a not-ready state (503 or signin) and for loading. */
export function unavailableVm(
  reason: IntegrationsUnavailableReason | undefined,
  loaded: boolean,
): IntegrationsViewModel {
  const vm: IntegrationsViewModel = {
    loaded,
    ready: false,
    toolkits: [],
    connections: [],
  };
  if (reason) vm.reason = reason;
  return vm;
}

/** A required non-empty string off an untrusted command payload. */
export function requireString(payload: unknown, key: string): string {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}
