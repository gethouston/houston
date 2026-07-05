import { useMemo, useState } from "react";
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
  AppCatalogPicker,
  INTEGRATION_PROVIDER,
  LoadingState,
  ReconnectBanner,
  SigninState,
  UnavailableState,
  useConnectFlow,
  useIntegrationsGate,
} from "../../integrations";
import { INTEGRATIONS_VIEW_ID } from "../../integrations-view/id";
import { AgentAppsSection, type AppsSectionCopy } from "./agent-apps-section";
import { agentIntegrationsView } from "./model";

/**
 * The per-agent Integrations tab: which apps THIS agent can use, one-click
 * activation of already-connected apps, and connecting brand-new ones. Behind
 * the shared boot gate; the grant view (multiplayer) and degraded view (host
 * without grant routes) are a discriminated union so the two never mix.
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
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const grantsCopy: AppsSectionCopy = {
    title: t("agentTab.activeTitle"),
    subtitle: t("agentTab.activeSubtitle", { agent: agent.name }),
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
        <div className="mb-6 min-h-[36px]">
          <h1 className="text-[28px] font-normal text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>

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
              <AgentAppsSection
                copy={grantsCopy}
                rows={view.activeRows}
                canEdit={canEdit}
                connectFlow={connectFlow}
                onDeactivate={removeGrant}
                onRemove={removeGrant}
                onAddApps={() => setPickerOpen(true)}
              />
            ) : (
              <AgentAppsSection
                copy={degradedCopy}
                rows={view.rows}
                canEdit={canEdit}
                connectFlow={connectFlow}
                onRemove={(toolkit) => disconnect.mutate(toolkit)}
                onAddApps={() => setPickerOpen(true)}
              />
            )}

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setViewMode(INTEGRATIONS_VIEW_ID)}
                className="text-xs text-muted-foreground underline underline-offset-4 decoration-dotted transition-colors hover:text-foreground"
              >
                {t("agentTab.manageAll")}
              </button>
            </div>

            <AppCatalogPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              catalog={catalog.data ?? []}
              connections={connections.data ?? []}
              connectFlow={connectFlow}
              loading={catalog.isLoading}
              grantedToolkits={
                view.mode === "grants" ? view.grantedToolkits : undefined
              }
              onActivate={
                view.mode === "grants" && canEdit
                  ? (toolkit) => grantMutation.mutate({ toolkit, op: "add" })
                  : undefined
              }
              agentName={view.mode === "grants" ? agent.name : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
