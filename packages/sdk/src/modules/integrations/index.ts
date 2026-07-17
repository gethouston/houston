/**
 * The integrations module — the SDK-canonical Composio surface.
 *
 * Reads: publishes the {@link INTEGRATIONS_SCOPE} view-model — readiness plus
 * the toolkit catalog and the user's connections — republished whole on every
 * refresh. Writes: connect / disconnect / poll flow as commands; the same
 * handlers back both the typed facade and the bridge `dispatch` path.
 *
 * SEAM — user-scoped, NOT per-agent. Integrations are gateway-owned and keyed by
 * the caller's session `sub`, so this module talks to the flat
 * {@link IntegrationsClient} (rooted at the base URL), never `clientFor(agentId)`.
 *
 * Degradation is explicit and end-to-end:
 *  - 503 (no key) → VM `{ready:false, reason:"unavailable"}` — the tab never crashes.
 *  - provider `ready:false, reason:"signin"` → VM `{ready:false, reason:"signin"}`.
 *  - a 401 routes through the shared {@link ModuleContext.authExpiry} notifier.
 */

import {
  EngineError,
  type IntegrationConnection,
  IntegrationsClient,
} from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";
import {
  INTEGRATIONS_SCOPE,
  IntegrationsCommand,
  type IntegrationsViewModel,
  requireString,
  unavailableVm,
} from "./types";
import { createIntegrationsWrites, type IntegrationsWrites } from "./writes";

export type {
  IntegrationConnection,
  IntegrationsCommandType,
  IntegrationsUnavailableReason,
  IntegrationsViewModel,
  IntegrationToolkit,
} from "./types";
export { INTEGRATIONS_SCOPE, IntegrationsCommand } from "./types";
export type { IntegrationsWrites } from "./writes";

/** The result of a connect: the URL the surface opens, plus the id to poll. */
export interface ConnectResult {
  redirectUrl: string;
  connectionId: string;
}

/** The typed facade for integration reads + writes. */
export interface IntegrationsModule {
  /** Scope string for `sdk.subscribe(...)` / `sdk.getSnapshot(...)`. */
  readonly scope: string;
  /** Refetch readiness + catalog + connections and republish the VM. */
  refresh(): Promise<IntegrationsViewModel>;
  /** Start an OAuth connect (composio); the surface opens `redirectUrl`, then polls. */
  connect(toolkit: string): Promise<ConnectResult>;
  /** Provider-scoped connect (additive): `agent` scopes it to one agent slug. */
  connect(
    provider: string,
    toolkit: string,
    agent?: string,
  ): Promise<ConnectResult>;
  /** Poll one connection until its OAuth finishes (status flips to active). */
  pollConnection(connectionId: string): Promise<IntegrationConnection>;
  /** Disconnect a toolkit everywhere, then refetch the VM. */
  disconnect(toolkit: string): Promise<IntegrationsViewModel>;
  /** Push the caller's Supabase token to the gateway adapter (`null` on sign-out). */
  setSession(token: string | null): Promise<void>;
  /** Dismiss the one-time "reconnect your integrations" notice (idempotent). */
  dismissReconnectNotice(): Promise<void>;
  /** No-refetch write variants for a host that owns its own reads (web under
   *  `reactivity:false`). The refetching methods above are untouched (iOS-safe). */
  writes: IntegrationsWrites;
}

export function createIntegrationsModule(
  ctx: ModuleContext,
): IntegrationsModule {
  const { store, authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;

  const client = new IntegrationsClient({ baseUrl, fetch: ports.fetch });
  const emitTokenExpired = () => authExpiry.notifyExpired();

  /** Run a client call, surfacing a 401 as the shared token-expiry signal. */
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof EngineError && err.status === 401) emitTokenExpired();
      throw err;
    }
  }

  const publish = (vm: IntegrationsViewModel): IntegrationsViewModel => {
    store.publish(INTEGRATIONS_SCOPE, vm);
    return vm;
  };

  async function refresh(): Promise<IntegrationsViewModel> {
    let statuses: Awaited<ReturnType<typeof client.listIntegrations>>;
    try {
      statuses = await run(() => client.listIntegrations());
    } catch (err) {
      // A missing gateway key (503) is a first-class state, not a failure: the
      // tab shows "not available" instead of red-toasting.
      if (err instanceof EngineError && err.status === 503) {
        return publish(unavailableVm("unavailable", true));
      }
      throw err;
    }

    const composio = statuses.find((s) => s.provider === "composio");
    if (!composio?.ready) {
      const reason = composio?.reason === "signin" ? "signin" : "unavailable";
      return publish(unavailableVm(reason, true));
    }

    const [toolkits, connections] = await Promise.all([
      run(() => client.listToolkits()),
      run(() => client.listConnections()),
    ]);
    return publish({ loaded: true, ready: true, toolkits, connections });
  }

  function connect(toolkit: string): Promise<ConnectResult>;
  function connect(
    provider: string,
    toolkit: string,
    agent?: string,
  ): Promise<ConnectResult>;
  function connect(
    a: string,
    b?: string,
    agent?: string,
  ): Promise<ConnectResult> {
    // 1-arg = legacy `connect(toolkit)` (composio, `{ toolkit }` body — what the
    // bridge command / iOS send, unchanged); 3-arg = `(provider, toolkit, agent?)`.
    const [provider, toolkit] = b === undefined ? [undefined, a] : [a, b];
    return run(() =>
      client.connect(toolkit, {
        ...(provider ? { provider } : {}),
        ...(agent ? { agent } : {}),
      }),
    );
  }

  function pollConnection(
    connectionId: string,
  ): Promise<IntegrationConnection> {
    return run(() => client.getConnection(connectionId));
  }

  async function disconnect(toolkit: string): Promise<IntegrationsViewModel> {
    await run(() => client.disconnect(toolkit));
    return refresh();
  }

  ctx.registerCommand(IntegrationsCommand.Refresh, () => refresh());
  ctx.registerCommand(IntegrationsCommand.Connect, (p) =>
    connect(requireString(p, "toolkit")),
  );
  ctx.registerCommand(IntegrationsCommand.PollConnection, (p) =>
    pollConnection(requireString(p, "connectionId")),
  );
  ctx.registerCommand(IntegrationsCommand.Disconnect, (p) =>
    disconnect(requireString(p, "toolkit")),
  );

  // Publish a defined "loading" snapshot asynchronously, so a subscriber reads
  // `undefined` until the first real load lands (mirrors the agents module).
  void Promise.resolve().then(() => {
    if (store.getSnapshot(INTEGRATIONS_SCOPE) === undefined) {
      store.publish(INTEGRATIONS_SCOPE, unavailableVm(undefined, false));
    }
  });

  return {
    scope: INTEGRATIONS_SCOPE,
    refresh,
    connect,
    pollConnection,
    disconnect,
    ...createIntegrationsWrites(client, run),
  };
}
