import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentGrantMutation,
  useAgentGrants,
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import {
  effectiveAllowlist,
  useAgentSettings,
} from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { canEditAgentGrants } from "../../../lib/org-roles";
import type { TabProps } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import {
  ConnectMoreAppsSection,
  INTEGRATION_PROVIDER,
  LoadingState,
  ReconnectBanner,
  SigninState,
  UnavailableState,
  useConnectFlow,
  useCustomIntegrations,
  useIntegrationsGate,
  useMcpIntegrations,
  useProviderDisconnect,
} from "../../integrations";
import { INTEGRATIONS_VIEW_ID } from "../../integrations-view/id";
import { AgentAppsBody } from "./agent-apps-body";
import { agentIntegrationsView } from "./model";

/**
 * The per-agent Integrations tab. Sections: the apps this agent can use, the
 * account apps ready to activate here (grants mode), the apps a Teams allowlist
 * forbids, and the always-visible "Connect more apps" catalog. The allowlist
 * editor lives in Agent Settings > Access, not here, so this tab renders
 * identically for members and managers. One tab-level connect flow with
 * `autoGrant` so a brand-new connection auto-activates on this agent. Behind the
 * shared boot gate; the grant view (multiplayer) and degraded view (host without
 * grant routes) are a discriminated union so the two never mix. On a Teams host
 * the effective allowlist (agent ceiling ∩ org ceiling) filters the browse
 * catalog and splits disallowed connected apps out; non-Teams hosts feature-
 * detect off and render exactly as before.
 */
export default function IntegrationsTab({ agent }: TabProps) {
  const { t } = useTranslation("integrations");
  const gate = useIntegrationsGate();
  const ready = gate.kind === "ready";
  const { capabilities } = useCapabilities();
  const teamsEnabled = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);
  const custom = useCustomIntegrations(ready);
  const mcp = useMcpIntegrations(ready);
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
  const grantMutation = useAgentGrantMutation(agent.id);
  const disconnectAccount = useProviderDisconnect(custom.slugs, mcp.slugs);
  const connectFlow = useConnectFlow({
    agentId: agent.id,
    autoGrant: grantsSupported && canEdit,
  });
  const setViewMode = useUIStore((s) => s.setViewMode);

  // Custom integrations and MCP servers merge into the agent's app list (grant
  // toggles work the same, keyed by connectionId), so they appear as
  // usable/activatable rows; the allowlist still bounds them. The browse catalog
  // below stays composio.
  const view = useMemo(
    () =>
      agentIntegrationsView({
        connections: [
          ...(connections.data ?? []),
          ...custom.connections,
          ...mcp.connections,
        ],
        catalog: [...(catalog.data ?? []), ...custom.toolkits, ...mcp.toolkits],
        grants,
        allowlist,
        customToolkits: custom.slugs,
        mcpToolkits: mcp.slugs,
      }),
    [
      connections.data,
      catalog.data,
      custom.connections,
      custom.toolkits,
      custom.slugs,
      mcp.connections,
      mcp.toolkits,
      mcp.slugs,
      grants,
      allowlist,
    ],
  );

  // The browse catalog is narrowed to the effective allowlist so a member can
  // only connect apps the agent is allowed to use (null = unrestricted).
  const browseCatalog = useMemo(() => {
    const all = catalog.data ?? [];
    if (allowlist === null) return all;
    const set = new Set(allowlist);
    return all.filter((tk) => set.has(tk.slug));
  }, [catalog.data, allowlist]);

  const bodyLoading =
    ready &&
    (grantsQuery.isLoading ||
      connections.isLoading ||
      catalog.isLoading ||
      custom.isLoading ||
      mcp.isLoading ||
      settingsQuery.isLoading);

  const removeGrant = (connectionId: string) =>
    grantMutation.mutate({ connectionId, op: "remove" });
  const activate = (connectionId: string) =>
    grantMutation.mutate({ connectionId, op: "add" });

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

            <AgentAppsBody
              view={view}
              canEdit={canEdit}
              connectFlow={connectFlow}
              onRemoveGrant={removeGrant}
              onActivate={activate}
              onDisconnect={disconnectAccount}
              onAddAccount={(toolkit) => void connectFlow.connect(toolkit)}
            />

            <div className="mt-8">
              <ConnectMoreAppsSection
                catalog={browseCatalog}
                connections={connections.data ?? []}
                connectFlow={connectFlow}
                loading={catalog.isLoading}
                customEnabled={custom.supported}
                mcpEnabled={mcp.supported}
                agentId={agent.id}
                autoGrant={grantsSupported && canEdit}
              />
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setViewMode(INTEGRATIONS_VIEW_ID)}
                className="text-xs text-muted-foreground underline underline-offset-4 decoration-dotted transition-colors hover:text-foreground"
              >
                {t("agentTab.manageAll")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
