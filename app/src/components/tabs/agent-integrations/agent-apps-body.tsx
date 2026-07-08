import { useTranslation } from "react-i18next";
import { type ConnectFlow, categoryListView } from "../../integrations";
import { AgentAccountAppsSection } from "./agent-account-apps-section";
import { AgentAppsSection, type AppsSectionCopy } from "./agent-apps-section";
import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import type { AgentAppRow, AgentIntegrationsView } from "./model";

interface AgentAppsBodyProps {
  view: AgentIntegrationsView;
  canEdit: boolean;
  /** Toolkit slugs in the picked category, or `null` for "all" (no filter). */
  inCat: Set<string> | null;
  /** Whether a specific category (not "all") is selected. */
  categoryActive: boolean;
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
 * copy lives next to its sections. The view-only category filter (`inCat`)
 * narrows every list the same way it narrows the browse catalog below.
 */
export function AgentAppsBody({
  view,
  canEdit,
  inCat,
  categoryActive,
  connectFlow,
  onRemoveGrant,
  onActivate,
  onDisconnect,
}: AgentAppsBodyProps) {
  const { t } = useTranslation("integrations");

  const inCategory = (rows: AgentAppRow[]) =>
    inCat ? rows.filter((r) => inCat.has(r.connection.toolkit)) : rows;

  // The main list's empty copy must not claim the agent has no apps when the
  // user has simply filtered to a category with none — a category-aware string.
  const mainCopy = (rows: AgentAppRow[], base: AppsSectionCopy) =>
    categoryListView({
      visibleCount: inCategory(rows).length,
      hasAny: rows.length > 0,
      categoryFiltered: categoryActive,
    }) === "empty-category"
      ? {
          ...base,
          emptyTitle: t("agentTab.empty.categoryTitle"),
          emptyBody: t("agentTab.empty.categoryBody"),
        }
      : base;

  if (view.mode !== "grants") {
    const degradedCopy: AppsSectionCopy = {
      title: t("agentTab.allApps.title"),
      subtitle: t("agentTab.allApps.subtitle"),
      emptyTitle: t("agentTab.empty.title"),
      emptyBody: t("agentTab.empty.body"),
    };
    return (
      <AgentAppsSection
        copy={mainCopy(view.rows, degradedCopy)}
        rows={inCategory(view.rows)}
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
  const accountRows = inCategory(view.accountRows);
  const disallowedRows = inCategory(view.disallowedRows);
  return (
    <>
      <AgentAppsSection
        copy={mainCopy(view.activeRows, grantsCopy)}
        rows={inCategory(view.activeRows)}
        canEdit={canEdit}
        connectFlow={connectFlow}
        onDeactivate={onRemoveGrant}
        onRemove={onRemoveGrant}
      />
      {canEdit && accountRows.length > 0 && (
        <AgentAccountAppsSection rows={accountRows} onActivate={onActivate} />
      )}
      {disallowedRows.length > 0 && (
        <AgentDisallowedAppsSection rows={disallowedRows} />
      )}
    </>
  );
}
