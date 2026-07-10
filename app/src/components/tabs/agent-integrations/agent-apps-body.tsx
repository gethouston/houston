import { useTranslation } from "react-i18next";
import { type ConnectFlow, categoryListView } from "../../integrations";
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
  /** Fully disconnect the app from the account (recovery "Remove", both modes). */
  onDisconnect: (toolkit: string) => void;
}

/**
 * The mode-specific apps list of the Integrations tab. Grants mode stacks the
 * usable apps and the Teams-disallowed apps; degraded mode (no grant routes)
 * shows every connected app as usable. Both modes are read-only for status:
 * activating an existing connection for an agent lives in Settings > Connected
 * accounts, so this tab carries no grant toggles. The only per-row affordance is
 * the pending/errored recovery callout, whose "Remove" disconnects the
 * connection from the account. Split out of the tab so the gate ladder there
 * stays readable and each mode's copy lives next to its sections. The view-only
 * category filter (`inCat`) narrows every list the same way it narrows the
 * browse catalog below.
 */
export function AgentAppsBody({
  view,
  canEdit,
  inCat,
  categoryActive,
  connectFlow,
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
  const disallowedRows = inCategory(view.disallowedRows);
  return (
    <>
      <AgentAppsSection
        copy={mainCopy(view.activeRows, grantsCopy)}
        rows={inCategory(view.activeRows)}
        canEdit={canEdit}
        connectFlow={connectFlow}
        onRemove={onDisconnect}
      />
      {disallowedRows.length > 0 && (
        <AgentDisallowedAppsSection rows={disallowedRows} />
      )}
    </>
  );
}
