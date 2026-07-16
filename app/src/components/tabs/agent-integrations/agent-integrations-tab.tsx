import { useMemo } from "react";
import {
  useAgentGrants,
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import {
  effectiveAllowlist,
  useAgentSettings,
} from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { canEditAgentGrants } from "../../../lib/agent-access";
import type { TabProps } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import {
  INTEGRATION_PROVIDER,
  LoadingState,
  ReconnectBanner,
  SigninState,
  UnavailableState,
  useConnectFlow,
  useIntegrationsGate,
} from "../../integrations";
import { INTEGRATIONS_VIEW_ID } from "../../integrations-view/id";
import { AgentIntegrationsBody } from "./agent-integrations-body";
import { agentIntegrationsView } from "./model";

/**
 * The per-agent Integrations tab, a pure CONNECT surface. Sections: the apps
 * this agent can use, the apps a Teams allowlist forbids, and the always-visible
 * "Connect more apps" catalog. Grant activate/deactivate controls have moved to
 * Settings > Connected accounts, so this tab only connects (with `autoGrant` so
 * a brand-new connection auto-activates on this agent), recovers a pending
 * connection, and disconnects. The allowlist editor lives in Agent Settings >
 * Access, so this tab renders identically for members and managers. Behind the
 * shared boot gate; the grant view (multiplayer) and degraded view (host without
 * grant routes) are a discriminated union so the two never mix. On a Teams host
 * the effective allowlist (agent ceiling ∩ org ceiling) filters the browse
 * catalog and splits disallowed connected apps out; non-Teams hosts feature-
 * detect off and render exactly as before. The bottom "manage" link routes to
 * the global Integrations page, which everyone can reach.
 */
export default function IntegrationsTab({ agent }: TabProps) {
  const gate = useIntegrationsGate();
  const ready = gate.kind === "ready";
  const { capabilities } = useCapabilities();
  const teamsEnabled = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);
  const grantsQuery = useAgentGrants(agent.id, ready);
  const settingsQuery = useAgentSettings(agent.id, ready && teamsEnabled);

  const grants = grantsQuery.data ?? null;
  const grantsSupported = grants !== null;
  const canEdit = grantsSupported
    ? canEditAgentGrants(capabilities, agent)
    : true;

  const settings = settingsQuery.data;
  const allowlist = useMemo(
    () => (settings ? effectiveAllowlist(settings) : null),
    [settings],
  );
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const connectFlow = useConnectFlow({
    agentId: agent.id,
    autoGrant: grantsSupported && canEdit,
  });
  const setViewMode = useUIStore((s) => s.setViewMode);
  const onManageAll = () => setViewMode(INTEGRATIONS_VIEW_ID);

  const view = useMemo(
    () =>
      agentIntegrationsView({
        connections: connections.data ?? [],
        catalog: catalog.data ?? [],
        grants,
        allowlist,
      }),
    [connections.data, catalog.data, grants, allowlist],
  );

  const bodyLoading =
    ready &&
    (grantsQuery.isLoading ||
      connections.isLoading ||
      catalog.isLoading ||
      settingsQuery.isLoading);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {gate.kind === "loading" ? (
          <LoadingState />
        ) : gate.kind === "unavailable" ? (
          <UnavailableState />
        ) : gate.kind === "signin" ? (
          <SigninState onSignIn={gate.signIn} signingIn={gate.signingIn} />
        ) : bodyLoading ? (
          <>
            {gate.reconnectNotice && (
              <ReconnectBanner onDismiss={gate.dismissReconnect} />
            )}
            <LoadingState />
          </>
        ) : (
          <>
            {gate.reconnectNotice && (
              <ReconnectBanner onDismiss={gate.dismissReconnect} />
            )}

            {/* Keyed by agent so the body's view-only category filter never
                leaks across agents — the tab stays mounted on agent switch. */}
            <AgentIntegrationsBody
              key={agent.id}
              view={view}
              canEdit={canEdit}
              catalog={catalog.data ?? []}
              allowlist={allowlist}
              connections={connections.data ?? []}
              connectFlow={connectFlow}
              catalogLoading={catalog.isLoading}
              onDisconnect={(toolkit) => disconnect.mutate(toolkit)}
              onManageAll={onManageAll}
            />
          </>
        )}
      </div>
    </div>
  );
}
