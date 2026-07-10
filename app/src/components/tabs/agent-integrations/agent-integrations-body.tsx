import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ConnectFlow,
  ConnectMoreAppsSection,
  toolkitsInCategory,
} from "../../integrations";
import { AgentAppsBody } from "./agent-apps-body";
import type { AgentIntegrationsView } from "./model";

interface AgentIntegrationsBodyProps {
  view: AgentIntegrationsView;
  canEdit: boolean;
  /** The full toolkit catalog (drives the category filter + browse list). */
  catalog: IntegrationToolkit[];
  /** The effective Teams allowlist (`null` = unrestricted). Apps outside it show
   *  as locked rows in the browse catalog rather than being hidden. */
  allowlist: string[] | null;
  /** The account's connections, so browse can hide already-connected apps. */
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** The catalog is still fetching (browse shows a loader, not "no apps"). */
  catalogLoading: boolean;
  onDisconnect: (toolkit: string) => void;
  /** The bottom link's destination. When the caller can see the global
   *  Integrations page it jumps there ("Manage all integrations"); a Teams plain
   *  member (page gone) is sent to Settings > Connected accounts instead. The
   *  boolean only picks the copy — `onManageAll` already performs the routing. */
  canSeePolicyPage: boolean;
  /** Perform the bottom-link navigation chosen by {@link canSeePolicyPage}. */
  onManageAll: () => void;
}

/**
 * The resolved body of the Integrations tab (apps list + browse catalog). It
 * owns the view-only category filter that narrows every list at once. Split out
 * of {@link IntegrationsTab} so the parent can remount it per agent with
 * `key={agent.id}`: the tab components stay mounted across agent switches (see
 * experience-renderer.tsx), so keeping `category` here would leak one agent's
 * filter onto the next — remounting resets it. All lifted view state lives in
 * this keyed component so none of it crosses agents.
 */
export function AgentIntegrationsBody({
  view,
  canEdit,
  catalog,
  allowlist,
  connections,
  connectFlow,
  catalogLoading,
  onDisconnect,
  canSeePolicyPage,
  onManageAll,
}: AgentIntegrationsBodyProps) {
  const { t } = useTranslation("integrations");

  // View-only category filter, one control for every list on the tab (the
  // usable / account / disallowed grids and the browse catalog below).
  const [category, setCategory] = useState("all");
  const inCat = useMemo(
    () => toolkitsInCategory(catalog, category),
    [catalog, category],
  );

  return (
    <>
      <AgentAppsBody
        view={view}
        canEdit={canEdit}
        inCat={inCat}
        categoryActive={category !== "all"}
        connectFlow={connectFlow}
        onDisconnect={onDisconnect}
      />

      <div className="mt-8">
        <ConnectMoreAppsSection
          catalog={catalog}
          connections={connections}
          connectFlow={connectFlow}
          category={category}
          onCategoryChange={setCategory}
          allowlist={allowlist}
          loading={catalogLoading}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onManageAll}
          className="text-xs text-muted-foreground underline underline-offset-4 decoration-dotted transition-colors hover:text-foreground"
        >
          {canSeePolicyPage
            ? t("agentTab.manageAll")
            : t("policyPage.manageAccounts")}
        </button>
      </div>
    </>
  );
}
