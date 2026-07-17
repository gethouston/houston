import { useMemo } from "react";
import {
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import { useAgentSettings } from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { isAgentManager } from "../../../lib/agent-access";
import { canSeeMembers } from "../../../lib/org-roles";
import type { TabProps } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import {
  INTEGRATION_PROVIDER,
  LoadingState,
  type PermissionsFix,
  ReconnectBanner,
  resolvePermissionsFix,
  SigninState,
  UnavailableState,
  useConnectFlow,
  useIntegrationsGate,
} from "../../integrations";
import { INTEGRATIONS_VIEW_ID } from "../../integrations-view/id";
import { PERMISSIONS_VIEW_ID } from "../../permissions/id";
import { usePermissionsNav } from "../../permissions/permissions-nav-store";
import { AgentIntegrationsBody } from "./agent-integrations-body";
import { agentIntegrationsView } from "./model";

/**
 * The per-agent Integrations tab, a pure CONNECT surface. Sections: the apps
 * this agent can use (connected AND inside the Teams allowlist), the apps a
 * Teams allowlist forbids (transparency + a role-aware pointer into
 * Permissions), and the always-visible "Connect more apps" catalog. Permissions
 * live in exactly one place — the Permissions view — so this tab never edits
 * them: it only connects (with the agent slug so the gateway enforces the
 * agent's effective allowlist), recovers a pending connection, and disconnects.
 * Behind the shared boot gate. On a Teams host the effective allowlist (agent
 * ceiling ∩ org ceiling) filters the browse catalog and splits disallowed
 * connected apps out; non-Teams hosts feature-detect off. The bottom "manage"
 * link routes to the global Integrations page, which everyone can reach.
 */
export default function IntegrationsTab({ agent }: TabProps) {
  const gate = useIntegrationsGate();
  const ready = gate.kind === "ready";
  const { capabilities } = useCapabilities();
  const teamsEnabled = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);
  const settingsQuery = useAgentSettings(agent.id, ready && teamsEnabled);

  const settings = settingsQuery.data;
  // The agent's own ceiling is the whole effective allowlist (policy is per
  // agent only). `null` = unrestricted.
  const allowlist = settings?.allowedToolkits ?? null;
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const connectFlow = useConnectFlow({ agentId: agent.id });
  const setViewMode = useUIStore((s) => s.setViewMode);
  const onManageAll = () => setViewMode(INTEGRATIONS_VIEW_ID);

  // Role-aware blocked-state signposting. A blocked app is always outside this
  // AGENT ceiling (policy is per agent only), so the fix always deep-links to
  // this agent's per-agent Permissions detail. The CTA needs `canSeeMembers`
  // too: a non-admin manager can't open the Permissions dashboard, so it would
  // be a dead link for them.
  const requestAgentDetail = usePermissionsNav((s) => s.requestAgentDetail);
  const canManageAgent =
    isAgentManager(capabilities, agent) && canSeeMembers(capabilities);
  const permissionsFix = useMemo<PermissionsFix>(
    () =>
      resolvePermissionsFix({
        canManageAgent,
        openAgentDetail: () => {
          requestAgentDetail(agent.id, "integrations");
          setViewMode(PERMISSIONS_VIEW_ID);
        },
      }),
    [canManageAgent, requestAgentDetail, setViewMode, agent.id],
  );

  const view = useMemo(
    () =>
      agentIntegrationsView({
        connections: connections.data ?? [],
        catalog: catalog.data ?? [],
        allowlist,
      }),
    [connections.data, catalog.data, allowlist],
  );

  const bodyLoading =
    ready &&
    (connections.isLoading || catalog.isLoading || settingsQuery.isLoading);

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
              agentId={agent.id}
              catalog={catalog.data ?? []}
              allowlist={allowlist}
              connections={connections.data ?? []}
              connectFlow={connectFlow}
              catalogLoading={catalog.isLoading}
              onDisconnect={(toolkit) => disconnect.mutate(toolkit)}
              onManageAll={onManageAll}
              permissionsFix={permissionsFix}
            />
          </>
        )}
      </div>
    </div>
  );
}
