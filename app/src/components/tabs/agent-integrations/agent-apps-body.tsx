import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "../../integrations";
import { AgentAccountAppsSection } from "./agent-account-apps-section";
import { AgentAppsSection, type AppsSectionCopy } from "./agent-apps-section";
import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import type { AgentIntegrationsView } from "./model";

interface AgentAppsBodyProps {
  view: AgentIntegrationsView;
  canEdit: boolean;
  connectFlow: ConnectFlow;
  /** Grants mode: drop this agent's grant for an active app. */
  onRemoveGrant: (toolkit: string) => void;
  /** Grants mode: grant an already-connected account app to this agent. */
  onActivate: (toolkit: string) => void;
  /** Degraded mode: fully disconnect the app from the account. */
  onDisconnect: (toolkit: string) => void;
}

/**
 * The mode-specific apps list of the Integrations tab. Grants mode stacks the
 * usable apps, the "ready to activate" account apps, and the Teams-disallowed
 * apps; degraded mode (no grant routes) shows every connected app as usable.
 * Split out of the tab so the gate ladder there stays readable and each mode's
 * copy lives next to its sections.
 */
export function AgentAppsBody({
  view,
  canEdit,
  connectFlow,
  onRemoveGrant,
  onActivate,
  onDisconnect,
}: AgentAppsBodyProps) {
  const { t } = useTranslation("integrations");

  if (view.mode !== "grants") {
    const degradedCopy: AppsSectionCopy = {
      title: t("agentTab.allApps.title"),
      subtitle: t("agentTab.allApps.subtitle"),
      emptyTitle: t("agentTab.empty.title"),
      emptyBody: t("agentTab.empty.body"),
    };
    return (
      <AgentAppsSection
        copy={degradedCopy}
        rows={view.rows}
        canEdit={canEdit}
        connectFlow={connectFlow}
        onRemove={onDisconnect}
      />
    );
  }

  const grantsCopy: AppsSectionCopy = {
    title: t("agentTab.activeTitle"),
    emptyTitle: t("agentTab.empty.title"),
    emptyBody: t("agentTab.empty.body"),
  };
  return (
    <>
      <AgentAppsSection
        copy={grantsCopy}
        rows={view.activeRows}
        canEdit={canEdit}
        connectFlow={connectFlow}
        onDeactivate={onRemoveGrant}
        onRemove={onRemoveGrant}
      />
      {canEdit && view.accountRows.length > 0 && (
        <AgentAccountAppsSection
          rows={view.accountRows}
          onActivate={onActivate}
        />
      )}
      {view.disallowedRows.length > 0 && (
        <AgentDisallowedAppsSection rows={view.disallowedRows} />
      )}
    </>
  );
}
