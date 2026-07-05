import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentGrantMutation,
  useAgentGrants,
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
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
  useIntegrationsGate,
} from "../../integrations";
import { INTEGRATIONS_VIEW_ID } from "../../integrations-view/id";
import { AgentAccountAppsSection } from "./agent-account-apps-section";
import { AgentAppsSection, type AppsSectionCopy } from "./agent-apps-section";
import { agentIntegrationsView } from "./model";

/**
 * The per-agent Integrations tab, three stacked sections: the apps this agent
 * can use, the account apps ready to activate here (grants mode), and the
 * always-visible "Connect more apps" catalog. One tab-level connect flow with
 * `autoGrant` so a brand-new connection auto-activates on this agent. Behind the
 * shared boot gate; the grant view (multiplayer) and degraded view (host without
 * grant routes) are a discriminated union so the two never mix.
 */
export default function IntegrationsTab({ agent }: TabProps) {
  const { t } = useTranslation("integrations");
  const gate = useIntegrationsGate();
  const ready = gate.kind === "ready";

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);
  const grantsQuery = useAgentGrants(agent.id, ready);
  const { capabilities } = useCapabilities();

  const grants = grantsQuery.data ?? null;
  const grantsSupported = grants !== null;
  const canEdit = grantsSupported
    ? canEditAgentGrants(capabilities, agent)
    : true;

  const grantMutation = useAgentGrantMutation(agent.id);
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const connectFlow = useConnectFlow({
    agentId: agent.id,
    autoGrant: grantsSupported && canEdit,
  });
  const setViewMode = useUIStore((s) => s.setViewMode);

  const view = useMemo(
    () =>
      agentIntegrationsView({
        connections: connections.data ?? [],
        catalog: catalog.data ?? [],
        grants,
      }),
    [connections.data, catalog.data, grants],
  );

  const bodyLoading =
    ready &&
    (grantsQuery.isLoading || connections.isLoading || catalog.isLoading);

  const removeGrant = (toolkit: string) =>
    grantMutation.mutate({ toolkit, op: "remove" });
  const activate = (toolkit: string) =>
    grantMutation.mutate({ toolkit, op: "add" });

  const grantsCopy: AppsSectionCopy = {
    title: t("agentTab.activeTitle"),
    emptyTitle: t("agentTab.empty.title"),
    emptyBody: t("agentTab.empty.body"),
  };
  const degradedCopy: AppsSectionCopy = {
    title: t("agentTab.allApps.title"),
    subtitle: t("agentTab.allApps.subtitle"),
    emptyTitle: t("agentTab.empty.title"),
    emptyBody: t("agentTab.empty.body"),
  };

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

            {view.mode === "grants" ? (
              <>
                <AgentAppsSection
                  copy={grantsCopy}
                  rows={view.activeRows}
                  canEdit={canEdit}
                  connectFlow={connectFlow}
                  onDeactivate={removeGrant}
                  onRemove={removeGrant}
                />
                {canEdit && view.accountRows.length > 0 && (
                  <AgentAccountAppsSection
                    rows={view.accountRows}
                    onActivate={activate}
                  />
                )}
              </>
            ) : (
              <AgentAppsSection
                copy={degradedCopy}
                rows={view.rows}
                canEdit={canEdit}
                connectFlow={connectFlow}
                onRemove={(toolkit) => disconnect.mutate(toolkit)}
              />
            )}

            <div className="mt-8">
              <ConnectMoreAppsSection
                catalog={catalog.data ?? []}
                connections={connections.data ?? []}
                connectFlow={connectFlow}
                loading={catalog.isLoading}
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
