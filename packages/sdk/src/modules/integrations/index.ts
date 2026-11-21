import type { IntegrationProviderId } from "@houston/protocol";
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

  function connect(
    provider: IntegrationProviderId,
    toolkit: string,
    agent?: string,
  ): Promise<ConnectResult> {
    return run(() => client.connect(provider, toolkit, agent));
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
   * Disconnects an outside app, removing every account the user connected
   * for it.
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
    connect("composio", requireString(p, "toolkit")),
  );
  ctx.registerCommand(IntegrationsCommand.PollConnection, (p) =>
    pollConnection(requireString(p, "connectionId")),
  );
  ctx.registerCommand(IntegrationsCommand.Disconnect, (p) =>
    disconnect(requireString(p, "toolkit")),
  );

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
