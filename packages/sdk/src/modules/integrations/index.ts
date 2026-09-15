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
 *
 * `refresh` and `pollConnection` read through {@link IntegrationsClient} rather
 * than the provider-scoped twins in `reads.ts`: the assistant catalog derives an
 * operation's route from the transport call in the declaration's own body, so
 * forwarding them would erase both from it. The provider-parameterised reads,
 * the custom connectors and their per-agent form live in `reads.ts`,
 * `custom.ts` and `custom-agent.ts`, bound here through `facade.ts`.
 */

import {
  EngineError,
  type IntegrationConnection,
  IntegrationsClient,
} from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";
import { moduleScope } from "../http";
import { requireString } from "../payload";
import type { ConnectResult, IntegrationsModule } from "./facade";
import {
  createAgentCustomIntegrations,
  createCustomIntegrations,
  createIntegrationsReads,
} from "./facade";
import {
  INTEGRATIONS_SCOPE,
  IntegrationsCommand,
  IntegrationsHttpError,
  type IntegrationsViewModel,
  unavailableVm,
} from "./types";
import { createIntegrationsWrites } from "./writes";

export type { ConnectResult, IntegrationsModule } from "./facade";
export type {
  IntegrationConnection,
  IntegrationsCommandType,
  IntegrationsUnavailableReason,
  IntegrationsViewModel,
  IntegrationToolkit,
} from "./types";
export { INTEGRATIONS_SCOPE, IntegrationsCommand } from "./types";
export type { IntegrationsWrites } from "./writes";

export function createIntegrationsModule(
  ctx: ModuleContext,
): IntegrationsModule {
  const { store, authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;

  const client = new IntegrationsClient({ baseUrl, fetch: ports.fetch });
  const emitTokenExpired = () => authExpiry.notifyExpired();
  const scope = moduleScope(ctx, "integrations", IntegrationsHttpError);

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

  /**
   * Shows which outside apps are available to connect and which ones the user
   * has already connected.
   * @assistant group:integrations
   * @assistant unroutable: readiness, the toolkit catalogue and the user's connections are three reads folded into one view, not one route.
   */
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

  /**
   * Checks whether a connection the user is signing in to has finished.
   * @assistant group:integrations
   * @assistant hidden: the poll a sign-in screen runs while the user finishes it; integrationConnection reads the same connection once.
   */
  function pollConnection(
    connectionId: string,
  ): Promise<IntegrationConnection> {
    return run(() => client.getConnection(connectionId));
  }

  /**
   * Disconnects an outside app from Houston, removing every account the user
   * connected for it.
   * @param toolkit The outside app to disconnect, by the toolkit slug
   *   integrationToolkits returned.
   * @assistant group:integrations
   * @assistant confirm: irreversible. Every account the user connected for that app is removed, and reconnecting means signing in to it again.
   */
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
    /**
     * Starts connecting an outside app, answering the sign-in link to open.
     * @assistant group:integrations
     * @assistant hidden: starts a browser sign-in only the user can finish; the assistant queues the connection card with request_connection instead.
     * @assistant hands: request_connection
     */
    connect,
    pollConnection,
    disconnect,
    ...createIntegrationsWrites(client, run),
    reads: createIntegrationsReads(scope),
    custom: createCustomIntegrations(scope),
    agentCustom: createAgentCustomIntegrations(scope),
  };
}
